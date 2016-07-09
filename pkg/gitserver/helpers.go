package gitserver

import (
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/shurcooL/go-goon"

	"sourcegraph.com/sourcegraph/sourcegraph/pkg/vcs"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/vcs/util"
)

// InsecureSkipCheckVerifySSH controls whether the client verifies the
// SSH server's certificate or host key. If InsecureSkipCheckVerifySSH
// is true, the program is susceptible to a man-in-the-middle
// attack. This should only be used for testing.
var InsecureSkipCheckVerifySSH bool

func runWithRemoteOpts(cmd *exec.Cmd, opt *vcs.RemoteOpts) error {
	if opt != nil && opt.SSH != nil {
		gitSSHWrapper, gitSSHWrapperDir, keyFile, err := makeGitSSHWrapper(opt.SSH.PrivateKey)
		defer func() {
			if keyFile != "" {
				if err := os.Remove(keyFile); err != nil {
					log.Fatalf("Error removing SSH key file %s: %s.", keyFile, err)
				}
			}
		}()
		if err != nil {
			return err
		}
		defer os.Remove(gitSSHWrapper)
		if gitSSHWrapperDir != "" {
			defer os.RemoveAll(gitSSHWrapperDir)
		}
		cmd.Env = append(cmd.Env, "GIT_SSH="+gitSSHWrapper)
	}

	if opt != nil && opt.HTTPS != nil {
		fmt.Printf("=================\n\n\ncalling makeGitPassHelper(%q, %q)\n\n", opt.HTTPS.User, opt.HTTPS.Pass)
		gitPassHelper, gitPassHelperDir, err := makeGitPassHelper(opt.HTTPS.User, opt.HTTPS.Pass)
		if err != nil {
			return err
		}
		defer os.Remove(gitPassHelper)
		if gitPassHelperDir != "" {
			defer os.RemoveAll(gitPassHelperDir)
		}
		//cmd.Env = append(cmd.Env, "GIT_ASKPASS="+gitPassHelper)
		cmd.Args = append(cmd.Args[:1], append([]string{"-c", "credential.helper=go-vcs-gitcmd-ch"}, cmd.Args[1:]...)...)
		cmd.Env = append(cmd.Env, "PATH="+gitPassHelperDir+":"+os.Getenv("PATH")) // TODO.
	}

	return cmd.Run()
}

// makeGitSSHWrapper writes a GIT_SSH wrapper that runs ssh with the
// private key. You should remove the sshWrapper, sshWrapperDir and
// the keyFile after using them.
func makeGitSSHWrapper(privKey []byte) (sshWrapper, sshWrapperDir, keyFile string, err error) {
	var otherOpt string
	if InsecureSkipCheckVerifySSH {
		otherOpt = "-o StrictHostKeyChecking=no"
	}

	kf, err := ioutil.TempFile("", "go-vcs-gitcmd-key")
	if err != nil {
		return "", "", "", err
	}
	keyFile = kf.Name()
	err = util.WriteFileWithPermissions(keyFile, privKey, 0600)
	if err != nil {
		return "", "", keyFile, err
	}

	tmpFile, tmpFileDir, err := gitSSHWrapper(keyFile, otherOpt)
	return tmpFile, tmpFileDir, keyFile, err
}

// Makes system-dependent SSH wrapper
func gitSSHWrapper(keyFile string, otherOpt string) (sshWrapperFile string, tempDir string, err error) {
	// TODO(sqs): encrypt and store the key in the env so that
	// attackers can't decrypt if they have disk access after our
	// process dies

	var script string

	if runtime.GOOS == "windows" {
		script = `
	@echo off
	ssh -o ControlMaster=no -o ControlPath=none ` + otherOpt + ` -i ` + filepath.ToSlash(keyFile) + ` "%@"
`
	} else {
		script = `
	#!/bin/sh
	exec /usr/bin/ssh -o ControlMaster=no -o ControlPath=none ` + otherOpt + ` -i ` + filepath.ToSlash(keyFile) + ` "$@"
`
	}

	sshWrapperName, tempDir, err := util.ScriptFile("go-vcs-gitcmd")
	if err != nil {
		return sshWrapperName, tempDir, err
	}

	err = util.WriteFileWithPermissions(sshWrapperName, []byte(script), 0500)
	return sshWrapperName, tempDir, err
}

// makeGitPassHelper writes a GIT_ASKPASS helper that supplies username and password over stdout.
// You should remove the passHelper (and tempDir if any) after using it.
func makeGitPassHelper(user, pass string) (passHelper string, tempDir string, err error) {
	// TODO: Make it available to git in PATH, etc.
	tmpFile, dir, err := util.ScriptFile("git-credential-go-vcs-gitcmd-ch")
	if err != nil {
		return tmpFile, dir, err
	}

	passPath := filepath.Join(dir, "password")
	var content string
	if user == "" {
		content = "password=" + pass + "\n"
	} else {
		content = "username=" + user + "\n" + "password=" + pass + "\n"
	}
	goon.DumpExpr(content)
	err = util.WriteFileWithPermissions(passPath, []byte(content), 0600)
	if err != nil {
		return tmpFile, dir, err
	}

	var script string

	// We assume passPath can be escaped with a simple wrapping of single
	// quotes. The path is not user controlled so this assumption should
	// not be violated.
	if runtime.GOOS == "windows" {
		script = "@echo off\ntype " + passPath + "\n"
	} else {
		script = "#!/bin/sh\ncat '" + passPath + "'\n"
	}

	err = util.WriteFileWithPermissions(tmpFile, []byte(script), 0500)
	return tmpFile, dir, err
}

// repoExists checks if dir is a valid GIT_DIR.
func repoExists(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "HEAD"))
	return !os.IsNotExist(err)
}

func recoverAndLog() {
	if err := recover(); err != nil {
		log.Print(err)
	}
}
