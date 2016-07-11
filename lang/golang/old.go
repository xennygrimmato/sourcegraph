// +build ignore

package golang

	var bctx = build.Context{
		GOARCH:     runtime.GOARCH,
		GOOS:       runtime.GOOS,
		GOROOT:     "/usr/local/go",
		GOPATH:     os.Getenv("GOPATH"),
		CgoEnabled: false,
		// UseAllFiles: true,
		Compiler: "gc",

		// TODO(sqs): make these use OS-independent separators
		JoinPath: path.Join,
		SplitPathList: func(list string) []string {
			if list == "" {
				return []string{}
			}
			return strings.Split(list, ":")
		},
		IsAbsPath: path.IsAbs,
		IsDir: func(path string) bool {
			// log.Printf("BCTX: IsDir(%q)", path)
			fi, _ := os.Stat(path)
			return fi != nil && fi.IsDir()
		},
		HasSubdir: func(root, dir string) (rel string, ok bool) {
			// log.Printf("BCTX: HasSubdir(%q, %q)", root, dir)
			root = path.Clean(root)
			dir = path.Clean(dir)
			if !strings.HasSuffix(root, "/") {
				root += "/"
			}
			if !strings.HasPrefix(dir, root) {
				return "", false
			}
			return dir[len(root):], true
		},
		ReadDir: func(dir string) ([]os.FileInfo, error) {
			// log.Printf("BCTX: ReadDir(%q)", dir)
			return ioutil.ReadDir(dir)
		},
		OpenFile: func(path string) (io.ReadCloser, error) {
			// log.Printf("BCTX: OpenFile(%q)", path)
			return os.Open(path)
		},
	}
