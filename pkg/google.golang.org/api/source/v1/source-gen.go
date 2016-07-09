// Package source provides access to the Cloud Source Repositories API.
//
// See https://cloud.google.com/eap/cloud-repositories/cloud-source-api
//
// Usage example:
//
//   import "google.golang.org/api/source/v1"
//   ...
//   sourceService, err := source.New(oauthHttpClient)
package source // import "sourcegraph.com/sourcegraph/sourcegraph/pkg/google.golang.org/api/source/v1"

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	context "golang.org/x/net/context"
	ctxhttp "golang.org/x/net/context/ctxhttp"
	gensupport "google.golang.org/api/gensupport"
	googleapi "google.golang.org/api/googleapi"
)

// Always reference these packages, just in case the auto-generated code
// below doesn't.
var _ = bytes.NewBuffer
var _ = strconv.Itoa
var _ = fmt.Sprintf
var _ = json.NewDecoder
var _ = io.Copy
var _ = url.Parse
var _ = gensupport.MarshalJSON
var _ = googleapi.Version
var _ = errors.New
var _ = strings.Replace
var _ = context.Canceled
var _ = ctxhttp.Do

const apiId = "source:v1"
const apiName = "source"
const apiVersion = "v1"
const basePath = "https://source.googleapis.com/"

// OAuth2 scopes used by this API.
const (
	// View and manage your data across Google Cloud Platform services
	CloudPlatformScope = "https://www.googleapis.com/auth/cloud-platform"
)

func New(client *http.Client) (*Service, error) {
	if client == nil {
		return nil, errors.New("client is nil")
	}
	s := &Service{client: client, BasePath: basePath}
	s.Projects = NewProjectsService(s)
	return s, nil
}

type Service struct {
	client    *http.Client
	BasePath  string // API endpoint base URL
	UserAgent string // optional additional User-Agent fragment

	Projects *ProjectsService
}

func (s *Service) userAgent() string {
	if s.UserAgent == "" {
		return googleapi.UserAgent
	}
	return googleapi.UserAgent + " " + s.UserAgent
}

func NewProjectsService(s *Service) *ProjectsService {
	rs := &ProjectsService{s: s}
	rs.Repos = NewProjectsReposService(s)
	return rs
}

type ProjectsService struct {
	s *Service

	Repos *ProjectsReposService
}

func NewProjectsReposService(s *Service) *ProjectsReposService {
	rs := &ProjectsReposService{s: s}
	rs.Workspaces = NewProjectsReposWorkspacesService(s)
	return rs
}

type ProjectsReposService struct {
	s *Service

	Workspaces *ProjectsReposWorkspacesService
}

func NewProjectsReposWorkspacesService(s *Service) *ProjectsReposWorkspacesService {
	rs := &ProjectsReposWorkspacesService{s: s}
	return rs
}

type ProjectsReposWorkspacesService struct {
	s *Service
}

// Action: An action to perform on a path in a workspace.
type Action struct {
	// CopyAction: Copy the contents of one path to another.
	CopyAction *CopyAction `json:"copyAction,omitempty"`

	// DeleteAction: Delete a file or directory.
	DeleteAction *DeleteAction `json:"deleteAction,omitempty"`

	// WriteAction: Create or modify a file.
	WriteAction *WriteAction `json:"writeAction,omitempty"`

	// ForceSendFields is a list of field names (e.g. "CopyAction") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *Action) MarshalJSON() ([]byte, error) {
	type noMethod Action
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// ChangedFileInfo: Represents file information.
type ChangedFileInfo struct {
	// FromPath: Related file path for copies or renames.
	//
	// For copies, the type will be ADDED and the from_path will point to
	// the
	// source of the copy. For renames, the type will be ADDED, the
	// from_path
	// will point to the source of the rename, and another ChangedFileInfo
	// record
	// with that path will appear with type DELETED. In other words, a
	// rename is
	// represented as a copy plus a delete of the old path.
	FromPath string `json:"fromPath,omitempty"`

	// Hash: A hex-encoded hash for the file.
	// Not necessarily a hash of the file's contents. Two paths in the
	// same
	// revision with the same hash have the same contents with high
	// probability.
	// Empty if the operation is CONFLICTED.
	Hash string `json:"hash,omitempty"`

	// Operation: The operation type for the file.
	//
	// Possible values:
	//   "OPERATION_UNSPECIFIED" - No operation was specified.
	//   "ADDED" - The file was added.
	//   "DELETED" - The file was deleted.
	//   "MODIFIED" - The file was modified.
	//   "CONFLICTED" - The result of merging the file is a conflict.
	// The CONFLICTED type only appears in Workspace.changed_files
	// or
	// Snapshot.changed_files when the workspace is in a merge state.
	Operation string `json:"operation,omitempty"`

	// Path: The path of the file.
	Path string `json:"path,omitempty"`

	// ForceSendFields is a list of field names (e.g. "FromPath") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *ChangedFileInfo) MarshalJSON() ([]byte, error) {
	type noMethod ChangedFileInfo
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// CloudWorkspaceId: A CloudWorkspaceId is a unique identifier for a
// cloud workspace.
// A cloud workspace is a place associated with a repo where modified
// files
// can be stored before they are committed.
type CloudWorkspaceId struct {
	// Name: The unique name of the workspace within the repo.  This is the
	// name
	// chosen by the client in the Source API's CreateWorkspace method.
	Name string `json:"name,omitempty"`

	// RepoId: The ID of the repo containing the workspace.
	RepoId *RepoId `json:"repoId,omitempty"`

	// ForceSendFields is a list of field names (e.g. "Name") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *CloudWorkspaceId) MarshalJSON() ([]byte, error) {
	type noMethod CloudWorkspaceId
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// CopyAction: Copy the contents of a file or directory at from_path in
// the specified
// revision or snapshot to to_path.
//
// To rename a file, copy it to the new path and delete the old.
type CopyAction struct {
	// FromPath: The path to copy from.
	FromPath string `json:"fromPath,omitempty"`

	// FromRevisionId: The revision ID from which to copy the file.
	FromRevisionId string `json:"fromRevisionId,omitempty"`

	// FromSnapshotId: The snapshot ID from which to copy the file.
	FromSnapshotId string `json:"fromSnapshotId,omitempty"`

	// ToPath: The path to copy to.
	ToPath string `json:"toPath,omitempty"`

	// ForceSendFields is a list of field names (e.g. "FromPath") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *CopyAction) MarshalJSON() ([]byte, error) {
	type noMethod CopyAction
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// CreateWorkspaceRequest: Request for CreateWorkspace.
type CreateWorkspaceRequest struct {
	// Actions: An ordered sequence of actions to perform in the workspace.
	// Can be empty.
	// Specifying actions here instead of using ModifyWorkspace saves one
	// RPC.
	Actions []*Action `json:"actions,omitempty"`

	// RepoId: The repo within which to create the workspace.
	RepoId *RepoId `json:"repoId,omitempty"`

	// Workspace: The following fields of workspace, with the allowable
	// exception of
	// baseline, must be set. No other fields of workspace should be
	// set.
	//
	// id.name
	// Provides the name of the workspace and must be unique within the
	// repo.
	// Note: Do not set field id.repo_id.  The repo_id is provided above as
	// a
	// CreateWorkspaceRequest field.
	//
	// alias:
	// If alias names an existing movable alias, the workspace's baseline
	// is set to the alias's revision.
	//
	// If alias does not name an existing movable alias, then the workspace
	// is
	// created with no baseline. When the workspace is committed, a new
	// root
	// revision is created with no parents. The new revision becomes
	// the
	// workspace's baseline and the alias name is used to create a movable
	// alias
	// referring to the revision.
	//
	// baseline:
	// A revision ID (hexadecimal string) for sequencing. If non-empty,
	// alias
	// must name an existing movable alias and baseline must match the
	// alias's
	// revision ID.
	Workspace *Workspace `json:"workspace,omitempty"`

	// ForceSendFields is a list of field names (e.g. "Actions") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *CreateWorkspaceRequest) MarshalJSON() ([]byte, error) {
	type noMethod CreateWorkspaceRequest
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// DeleteAction: Delete a file or directory.
type DeleteAction struct {
	// Path: The path of the file or directory. If path refers to
	// a
	// directory, the directory and its contents are deleted.
	Path string `json:"path,omitempty"`

	// ForceSendFields is a list of field names (e.g. "Path") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *DeleteAction) MarshalJSON() ([]byte, error) {
	type noMethod DeleteAction
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// Empty: A generic empty message that you can re-use to avoid defining
// duplicated
// empty messages in your APIs. A typical example is to use it as the
// request
// or the response type of an API method. For instance:
//
//     service Foo {
//       rpc Bar(google.protobuf.Empty) returns
// (google.protobuf.Empty);
//     }
//
// The JSON representation for `Empty` is empty JSON object `{}`.
type Empty struct {
	// ServerResponse contains the HTTP response code and headers from the
	// server.
	googleapi.ServerResponse `json:"-"`
}

// ListReposResponse: Response for ListRepos.
type ListReposResponse struct {
	// Repos: The listed repos.
	Repos []*Repo `json:"repos,omitempty"`

	// ServerResponse contains the HTTP response code and headers from the
	// server.
	googleapi.ServerResponse `json:"-"`

	// ForceSendFields is a list of field names (e.g. "Repos") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *ListReposResponse) MarshalJSON() ([]byte, error) {
	type noMethod ListReposResponse
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// ListWorkspacesResponse: Response for ListWorkspaces.
type ListWorkspacesResponse struct {
	// Workspaces: The listed workspaces.
	Workspaces []*Workspace `json:"workspaces,omitempty"`

	// ServerResponse contains the HTTP response code and headers from the
	// server.
	googleapi.ServerResponse `json:"-"`

	// ForceSendFields is a list of field names (e.g. "Workspaces") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *ListWorkspacesResponse) MarshalJSON() ([]byte, error) {
	type noMethod ListWorkspacesResponse
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// MergeInfo: MergeInfo holds information needed while resolving
// merges, and
// refreshes that
// involve conflicts.
type MergeInfo struct {
	// CommonAncestorRevisionId: Revision ID of the closest common ancestor
	// of the file trees that are
	// participating in a refresh or merge.  During a refresh, the
	// common
	// ancestor is the baseline of the workspace.  During a merge of
	// two
	// branches, the common ancestor is derived from the workspace baseline
	// and
	// the alias of the branch being merged in.  The repository state at
	// the
	// common ancestor provides the base version for a three-way merge.
	CommonAncestorRevisionId string `json:"commonAncestorRevisionId,omitempty"`

	// IsRefresh: If true, a refresh operation is in progress.  If false, a
	// merge is in
	// progress.
	IsRefresh bool `json:"isRefresh,omitempty"`

	// OtherRevisionId: During a refresh, the ID of the revision with which
	// the workspace is being
	// refreshed. This is the revision ID to which the workspace's alias
	// refers
	// at the time of the RefreshWorkspace call. During a merge, the ID of
	// the
	// revision that's being merged into the workspace's alias. This is
	// the
	// revision_id field of the MergeRequest.
	OtherRevisionId string `json:"otherRevisionId,omitempty"`

	// WorkspaceAfterSnapshotId: The workspace snapshot immediately after
	// the refresh or merge RPC
	// completes.  If a file has conflicts, this snapshot contains
	// the
	// version of the file with conflict markers.
	WorkspaceAfterSnapshotId string `json:"workspaceAfterSnapshotId,omitempty"`

	// WorkspaceBeforeSnapshotId: During a refresh, the snapshot ID of the
	// latest change to the workspace
	// before the refresh.  During a merge, the workspace's baseline, which
	// is
	// identical to the commit hash of the workspace's alias before
	// initiating
	// the merge.
	WorkspaceBeforeSnapshotId string `json:"workspaceBeforeSnapshotId,omitempty"`

	// ForceSendFields is a list of field names (e.g.
	// "CommonAncestorRevisionId") to unconditionally include in API
	// requests. By default, fields with empty values are omitted from API
	// requests. However, any non-pointer, non-interface field appearing in
	// ForceSendFields will be sent to the server regardless of whether the
	// field is empty or not. This may be used to include empty fields in
	// Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *MergeInfo) MarshalJSON() ([]byte, error) {
	type noMethod MergeInfo
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// ModifyWorkspaceRequest: Request for ModifyWorkspace.
type ModifyWorkspaceRequest struct {
	// Actions: An ordered sequence of actions to perform in the workspace.
	// May not be
	// empty.
	Actions []*Action `json:"actions,omitempty"`

	// CurrentSnapshotId: If non-empty, current_snapshot_id must refer to
	// the most recent update to
	// the workspace, or ABORTED is returned.
	CurrentSnapshotId string `json:"currentSnapshotId,omitempty"`

	// WorkspaceId: The ID of the workspace.
	WorkspaceId *CloudWorkspaceId `json:"workspaceId,omitempty"`

	// ForceSendFields is a list of field names (e.g. "Actions") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *ModifyWorkspaceRequest) MarshalJSON() ([]byte, error) {
	type noMethod ModifyWorkspaceRequest
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// ProjectRepoId: Selects a repo using a Google Cloud Platform project
// ID
// (e.g. winged-cargo-31) and a repo name within that project.
type ProjectRepoId struct {
}

// Repo: A repository (or repo) stores files for a version-control
// system.
type Repo struct {
	// CreateTime: Timestamp when the repo was created.
	CreateTime string `json:"createTime,omitempty"`

	// Id: Randomly generated ID that uniquely identifies a repo.
	Id string `json:"id,omitempty"`

	// Name: Human-readable, user-defined name of the repository. Names must
	// be
	// alphanumeric, lowercase, begin with a letter, and be between 3 and
	// 63
	// characters long. The - character can appear in the middle
	// positions.
	// (Names must satisfy the regular expression
	// a-z{1,61}[a-z0-9].)
	Name string `json:"name,omitempty"`

	// ProjectId: Immutable, globally unique, DNS-compatible textual
	// identifier.
	// Examples: user-chosen-project-id, yellow-banana-33.
	ProjectId string `json:"projectId,omitempty"`

	// RepoSyncConfig: How RepoSync is configured for this repo. If missing,
	// this
	// repo is not set up for RepoSync.
	RepoSyncConfig *RepoSyncConfig `json:"repoSyncConfig,omitempty"`

	// State: The state the repo is in.
	//
	// Possible values:
	//   "STATE_UNSPECIFIED" - No state was specified.
	//   "LIVE" - The repo is live and available for use.
	//   "DELETED" - The repo has been deleted.
	State string `json:"state,omitempty"`

	// Vcs: The version control system of the repo.
	//
	// Possible values:
	//   "VCS_UNSPECIFIED" - No version control system was specified.
	//   "GIT" - The Git version control system.
	Vcs string `json:"vcs,omitempty"`

	// ServerResponse contains the HTTP response code and headers from the
	// server.
	googleapi.ServerResponse `json:"-"`

	// ForceSendFields is a list of field names (e.g. "CreateTime") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *Repo) MarshalJSON() ([]byte, error) {
	type noMethod Repo
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// RepoId: A unique identifier for a cloud repo.
type RepoId struct {
	// ProjectRepoId: A combination of a project ID and a repo name.
	ProjectRepoId *ProjectRepoId `json:"projectRepoId,omitempty"`

	// Uid: A server-assigned, globally unique identifier.
	Uid string `json:"uid,omitempty"`

	// ForceSendFields is a list of field names (e.g. "ProjectRepoId") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *RepoId) MarshalJSON() ([]byte, error) {
	type noMethod RepoId
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// RepoSyncConfig: RepoSync configuration information.
type RepoSyncConfig struct {
	// ExternalRepoUrl: If this repo is enabled for RepoSync, this will be
	// the URL of the
	// external repo that this repo should sync with.
	ExternalRepoUrl string `json:"externalRepoUrl,omitempty"`

	// Status: The status of RepoSync.
	//
	// Possible values:
	//   "REPO_SYNC_STATUS_UNSPECIFIED" - No RepoSync status was specified.
	//   "OK" - RepoSync is working.
	//   "FAILED_AUTH" - RepoSync failed because of
	// authorization/authentication.
	//   "FAILED_OTHER" - RepoSync failed for a reason other than auth.
	//   "FAILED_NOT_FOUND" - RepoSync failed because the repository was not
	// found.
	Status string `json:"status,omitempty"`

	// ForceSendFields is a list of field names (e.g. "ExternalRepoUrl") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *RepoSyncConfig) MarshalJSON() ([]byte, error) {
	type noMethod RepoSyncConfig
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// UpdateRepoRequest: Request for UpdateRepo.
type UpdateRepoRequest struct {
	// RepoId: The ID of the repo to be updated.
	RepoId *RepoId `json:"repoId,omitempty"`

	// RepoName: Renames the repo. repo_name cannot already be in use by a
	// LIVE repo
	// within the project. This field is ignored if left blank or set to the
	// empty
	// string. If you want to rename a repo to "default," you need to
	// explicitly
	// set that value here.
	RepoName string `json:"repoName,omitempty"`

	// ForceSendFields is a list of field names (e.g. "RepoId") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *UpdateRepoRequest) MarshalJSON() ([]byte, error) {
	type noMethod UpdateRepoRequest
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// Workspace: A Cloud Workspace stores modified files before they are
// committed to
// a repo. This message contains metadata. Use the Read
// or
// ReadFromWorkspaceOrAlias methods to read files from the
// workspace,
// and use ModifyWorkspace to change files.
type Workspace struct {
	// Alias: The alias associated with the workspace. When the workspace is
	// committed,
	// this alias will be moved to point to the new revision.
	Alias string `json:"alias,omitempty"`

	// Baseline: The revision of the workspace's alias when the workspace
	// was
	// created.
	Baseline string `json:"baseline,omitempty"`

	// ChangedFiles: The set of files modified in this workspace.
	ChangedFiles []*ChangedFileInfo `json:"changedFiles,omitempty"`

	// CurrentSnapshotId: If non-empty, current_snapshot_id refers to the
	// most recent update to the
	// workspace.
	CurrentSnapshotId string `json:"currentSnapshotId,omitempty"`

	// Id: The ID of the workspace.
	Id *CloudWorkspaceId `json:"id,omitempty"`

	// MergeInfo: Information needed to manage a refresh or merge operation.
	// Present only
	// during a merge (i.e. after a call to Merge) or a call
	// to
	// RefreshWorkspace which results in conflicts.
	MergeInfo *MergeInfo `json:"mergeInfo,omitempty"`

	// ServerResponse contains the HTTP response code and headers from the
	// server.
	googleapi.ServerResponse `json:"-"`

	// ForceSendFields is a list of field names (e.g. "Alias") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *Workspace) MarshalJSON() ([]byte, error) {
	type noMethod Workspace
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// WriteAction: Create or modify a file.
type WriteAction struct {
	// Contents: The new contents of the file.
	Contents string `json:"contents,omitempty"`

	// Mode: The new mode of the file.
	//
	// Possible values:
	//   "FILE_MODE_UNSPECIFIED" - No file mode was specified.
	//   "NORMAL" - Neither a symbolic link nor executable.
	//   "SYMLINK" - A symbolic link.
	//   "EXECUTABLE" - An executable.
	Mode string `json:"mode,omitempty"`

	// Path: The path of the file to write.
	Path string `json:"path,omitempty"`

	// ForceSendFields is a list of field names (e.g. "Contents") to
	// unconditionally include in API requests. By default, fields with
	// empty values are omitted from API requests. However, any non-pointer,
	// non-interface field appearing in ForceSendFields will be sent to the
	// server regardless of whether the field is empty or not. This may be
	// used to include empty fields in Patch requests.
	ForceSendFields []string `json:"-"`
}

func (s *WriteAction) MarshalJSON() ([]byte, error) {
	type noMethod WriteAction
	raw := noMethod(*s)
	return gensupport.MarshalJSON(raw, s.ForceSendFields)
}

// method id "source.projects.repos.create":

type ProjectsReposCreateCall struct {
	s          *Service
	projectId  string
	repo       *Repo
	urlParams_ gensupport.URLParams
	ctx_       context.Context
}

// Create: Creates a repo in the given project. The provided repo
// message should have
// its name field set to the desired repo name. No other repo fields
// should
// be set. Omitting the name is the same as specifying "default"
//
// Repo names must satisfy the regular expression
// `a-z{1,61}[a-z0-9]`. (Note that repo names must contain at
// least three characters and may not contain underscores.) The special
// name
// "default" is the default repo for the project; this is the repo shown
// when
// visiting the Cloud Developers Console, and can be accessed via git's
// HTTP
// protocol at `https://source.developers.google.com/p/PROJECT_ID`. You
// may
// create other repos with this API and access them
// at
// `https://source.developers.google.com/p/PROJECT_ID/r/NAME`.
func (r *ProjectsReposService) Create(projectId string, repo *Repo) *ProjectsReposCreateCall {
	c := &ProjectsReposCreateCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repo = repo
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposCreateCall) Fields(s ...googleapi.Field) *ProjectsReposCreateCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposCreateCall) Context(ctx context.Context) *ProjectsReposCreateCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposCreateCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	var body io.Reader = nil
	body, err := googleapi.WithoutDataWrapper.JSONReader(c.repo)
	if err != nil {
		return nil, err
	}
	reqHeaders.Set("Content-Type", "application/json")
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("POST", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.create" call.
// Exactly one of *Repo or error will be non-nil. Any non-2xx status
// code is an error. Response headers are in either
// *Repo.ServerResponse.Header or (if a response was returned at all) in
// error.(*googleapi.Error).Header. Use googleapi.IsNotModified to check
// whether the returned error was because http.StatusNotModified was
// returned.
func (c *ProjectsReposCreateCall) Do(opts ...googleapi.CallOption) (*Repo, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &Repo{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Creates a repo in the given project. The provided repo message should have\nits name field set to the desired repo name. No other repo fields should\nbe set. Omitting the name is the same as specifying \"default\"\n\nRepo names must satisfy the regular expression\n`a-z{1,61}[a-z0-9]`. (Note that repo names must contain at\nleast three characters and may not contain underscores.) The special name\n\"default\" is the default repo for the project; this is the repo shown when\nvisiting the Cloud Developers Console, and can be accessed via git's HTTP\nprotocol at `https://source.developers.google.com/p/PROJECT_ID`. You may\ncreate other repos with this API and access them at\n`https://source.developers.google.com/p/PROJECT_ID/r/NAME`.",
	//   "flatPath": "v1/projects/{projectId}/repos",
	//   "httpMethod": "POST",
	//   "id": "source.projects.repos.create",
	//   "parameterOrder": [
	//     "projectId"
	//   ],
	//   "parameters": {
	//     "projectId": {
	//       "description": "The project in which to create the repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos",
	//   "request": {
	//     "$ref": "Repo"
	//   },
	//   "response": {
	//     "$ref": "Repo"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.delete":

type ProjectsReposDeleteCall struct {
	s          *Service
	projectId  string
	repoName   string
	urlParams_ gensupport.URLParams
	ctx_       context.Context
}

// Delete: Deletes a repo.
func (r *ProjectsReposService) Delete(projectId string, repoName string) *ProjectsReposDeleteCall {
	c := &ProjectsReposDeleteCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repoName = repoName
	return c
}

// Uid sets the optional parameter "uid": A server-assigned, globally
// unique identifier.
func (c *ProjectsReposDeleteCall) Uid(uid string) *ProjectsReposDeleteCall {
	c.urlParams_.Set("uid", uid)
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposDeleteCall) Fields(s ...googleapi.Field) *ProjectsReposDeleteCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposDeleteCall) Context(ctx context.Context) *ProjectsReposDeleteCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposDeleteCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	var body io.Reader = nil
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos/{repoName}")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("DELETE", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
		"repoName":  c.repoName,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.delete" call.
// Exactly one of *Empty or error will be non-nil. Any non-2xx status
// code is an error. Response headers are in either
// *Empty.ServerResponse.Header or (if a response was returned at all)
// in error.(*googleapi.Error).Header. Use googleapi.IsNotModified to
// check whether the returned error was because http.StatusNotModified
// was returned.
func (c *ProjectsReposDeleteCall) Do(opts ...googleapi.CallOption) (*Empty, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &Empty{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Deletes a repo.",
	//   "flatPath": "v1/projects/{projectId}/repos/{repoName}",
	//   "httpMethod": "DELETE",
	//   "id": "source.projects.repos.delete",
	//   "parameterOrder": [
	//     "projectId",
	//     "repoName"
	//   ],
	//   "parameters": {
	//     "projectId": {
	//       "description": "The ID of the project.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "repoName": {
	//       "description": "The name of the repo. Leave empty for the default repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "uid": {
	//       "description": "A server-assigned, globally unique identifier.",
	//       "location": "query",
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos/{repoName}",
	//   "response": {
	//     "$ref": "Empty"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.get":

type ProjectsReposGetCall struct {
	s            *Service
	projectId    string
	repoName     string
	urlParams_   gensupport.URLParams
	ifNoneMatch_ string
	ctx_         context.Context
}

// Get: Returns information about a repo.
func (r *ProjectsReposService) Get(projectId string, repoName string) *ProjectsReposGetCall {
	c := &ProjectsReposGetCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repoName = repoName
	return c
}

// Uid sets the optional parameter "uid": A server-assigned, globally
// unique identifier.
func (c *ProjectsReposGetCall) Uid(uid string) *ProjectsReposGetCall {
	c.urlParams_.Set("uid", uid)
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposGetCall) Fields(s ...googleapi.Field) *ProjectsReposGetCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// IfNoneMatch sets the optional parameter which makes the operation
// fail if the object's ETag matches the given value. This is useful for
// getting updates only after the object has changed since the last
// request. Use googleapi.IsNotModified to check whether the response
// error from Do is the result of In-None-Match.
func (c *ProjectsReposGetCall) IfNoneMatch(entityTag string) *ProjectsReposGetCall {
	c.ifNoneMatch_ = entityTag
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposGetCall) Context(ctx context.Context) *ProjectsReposGetCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposGetCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	if c.ifNoneMatch_ != "" {
		reqHeaders.Set("If-None-Match", c.ifNoneMatch_)
	}
	var body io.Reader = nil
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos/{repoName}")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("GET", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
		"repoName":  c.repoName,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.get" call.
// Exactly one of *Repo or error will be non-nil. Any non-2xx status
// code is an error. Response headers are in either
// *Repo.ServerResponse.Header or (if a response was returned at all) in
// error.(*googleapi.Error).Header. Use googleapi.IsNotModified to check
// whether the returned error was because http.StatusNotModified was
// returned.
func (c *ProjectsReposGetCall) Do(opts ...googleapi.CallOption) (*Repo, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &Repo{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Returns information about a repo.",
	//   "flatPath": "v1/projects/{projectId}/repos/{repoName}",
	//   "httpMethod": "GET",
	//   "id": "source.projects.repos.get",
	//   "parameterOrder": [
	//     "projectId",
	//     "repoName"
	//   ],
	//   "parameters": {
	//     "projectId": {
	//       "description": "The ID of the project.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "repoName": {
	//       "description": "The name of the repo. Leave empty for the default repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "uid": {
	//       "description": "A server-assigned, globally unique identifier.",
	//       "location": "query",
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos/{repoName}",
	//   "response": {
	//     "$ref": "Repo"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.list":

type ProjectsReposListCall struct {
	s            *Service
	projectId    string
	urlParams_   gensupport.URLParams
	ifNoneMatch_ string
	ctx_         context.Context
}

// List: Returns all repos belonging to a project, specified by its
// project ID. The
// response list is sorted by name with the default repo listed first.
func (r *ProjectsReposService) List(projectId string) *ProjectsReposListCall {
	c := &ProjectsReposListCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposListCall) Fields(s ...googleapi.Field) *ProjectsReposListCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// IfNoneMatch sets the optional parameter which makes the operation
// fail if the object's ETag matches the given value. This is useful for
// getting updates only after the object has changed since the last
// request. Use googleapi.IsNotModified to check whether the response
// error from Do is the result of In-None-Match.
func (c *ProjectsReposListCall) IfNoneMatch(entityTag string) *ProjectsReposListCall {
	c.ifNoneMatch_ = entityTag
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposListCall) Context(ctx context.Context) *ProjectsReposListCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposListCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	if c.ifNoneMatch_ != "" {
		reqHeaders.Set("If-None-Match", c.ifNoneMatch_)
	}
	var body io.Reader = nil
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("GET", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.list" call.
// Exactly one of *ListReposResponse or error will be non-nil. Any
// non-2xx status code is an error. Response headers are in either
// *ListReposResponse.ServerResponse.Header or (if a response was
// returned at all) in error.(*googleapi.Error).Header. Use
// googleapi.IsNotModified to check whether the returned error was
// because http.StatusNotModified was returned.
func (c *ProjectsReposListCall) Do(opts ...googleapi.CallOption) (*ListReposResponse, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &ListReposResponse{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Returns all repos belonging to a project, specified by its project ID. The\nresponse list is sorted by name with the default repo listed first.",
	//   "flatPath": "v1/projects/{projectId}/repos",
	//   "httpMethod": "GET",
	//   "id": "source.projects.repos.list",
	//   "parameterOrder": [
	//     "projectId"
	//   ],
	//   "parameters": {
	//     "projectId": {
	//       "description": "The project ID whose repos should be listed.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos",
	//   "response": {
	//     "$ref": "ListReposResponse"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.update":

type ProjectsReposUpdateCall struct {
	s                 *Service
	projectId         string
	repoName          string
	updatereporequest *UpdateRepoRequest
	urlParams_        gensupport.URLParams
	ctx_              context.Context
}

// Update: Updates an existing repo. The only things you can change
// about a repo are:
//   1) its repo_sync_config (and then only to add one that is not
// present);
//   2) its last-updated time; and
//   3) its name.
func (r *ProjectsReposService) Update(projectId string, repoName string, updatereporequest *UpdateRepoRequest) *ProjectsReposUpdateCall {
	c := &ProjectsReposUpdateCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repoName = repoName
	c.updatereporequest = updatereporequest
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposUpdateCall) Fields(s ...googleapi.Field) *ProjectsReposUpdateCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposUpdateCall) Context(ctx context.Context) *ProjectsReposUpdateCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposUpdateCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	var body io.Reader = nil
	body, err := googleapi.WithoutDataWrapper.JSONReader(c.updatereporequest)
	if err != nil {
		return nil, err
	}
	reqHeaders.Set("Content-Type", "application/json")
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos/{repoName}")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("PUT", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
		"repoName":  c.repoName,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.update" call.
// Exactly one of *Repo or error will be non-nil. Any non-2xx status
// code is an error. Response headers are in either
// *Repo.ServerResponse.Header or (if a response was returned at all) in
// error.(*googleapi.Error).Header. Use googleapi.IsNotModified to check
// whether the returned error was because http.StatusNotModified was
// returned.
func (c *ProjectsReposUpdateCall) Do(opts ...googleapi.CallOption) (*Repo, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &Repo{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Updates an existing repo. The only things you can change about a repo are:\n  1) its repo_sync_config (and then only to add one that is not present);\n  2) its last-updated time; and\n  3) its name.",
	//   "flatPath": "v1/projects/{projectId}/repos/{repoName}",
	//   "httpMethod": "PUT",
	//   "id": "source.projects.repos.update",
	//   "parameterOrder": [
	//     "projectId",
	//     "repoName"
	//   ],
	//   "parameters": {
	//     "projectId": {
	//       "description": "The ID of the project.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "repoName": {
	//       "description": "The name of the repo. Leave empty for the default repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos/{repoName}",
	//   "request": {
	//     "$ref": "UpdateRepoRequest"
	//   },
	//   "response": {
	//     "$ref": "Repo"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.workspaces.create":

type ProjectsReposWorkspacesCreateCall struct {
	s                      *Service
	projectId              string
	repoName               string
	createworkspacerequest *CreateWorkspaceRequest
	urlParams_             gensupport.URLParams
	ctx_                   context.Context
}

// Create: Creates a workspace.
func (r *ProjectsReposWorkspacesService) Create(projectId string, repoName string, createworkspacerequest *CreateWorkspaceRequest) *ProjectsReposWorkspacesCreateCall {
	c := &ProjectsReposWorkspacesCreateCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repoName = repoName
	c.createworkspacerequest = createworkspacerequest
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposWorkspacesCreateCall) Fields(s ...googleapi.Field) *ProjectsReposWorkspacesCreateCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposWorkspacesCreateCall) Context(ctx context.Context) *ProjectsReposWorkspacesCreateCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposWorkspacesCreateCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	var body io.Reader = nil
	body, err := googleapi.WithoutDataWrapper.JSONReader(c.createworkspacerequest)
	if err != nil {
		return nil, err
	}
	reqHeaders.Set("Content-Type", "application/json")
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos/{repoName}/workspaces")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("POST", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
		"repoName":  c.repoName,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.workspaces.create" call.
// Exactly one of *Workspace or error will be non-nil. Any non-2xx
// status code is an error. Response headers are in either
// *Workspace.ServerResponse.Header or (if a response was returned at
// all) in error.(*googleapi.Error).Header. Use googleapi.IsNotModified
// to check whether the returned error was because
// http.StatusNotModified was returned.
func (c *ProjectsReposWorkspacesCreateCall) Do(opts ...googleapi.CallOption) (*Workspace, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &Workspace{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Creates a workspace.",
	//   "flatPath": "v1/projects/{projectId}/repos/{repoName}/workspaces",
	//   "httpMethod": "POST",
	//   "id": "source.projects.repos.workspaces.create",
	//   "parameterOrder": [
	//     "projectId",
	//     "repoName"
	//   ],
	//   "parameters": {
	//     "projectId": {
	//       "description": "The ID of the project.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "repoName": {
	//       "description": "The name of the repo. Leave empty for the default repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos/{repoName}/workspaces",
	//   "request": {
	//     "$ref": "CreateWorkspaceRequest"
	//   },
	//   "response": {
	//     "$ref": "Workspace"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.workspaces.delete":

type ProjectsReposWorkspacesDeleteCall struct {
	s          *Service
	projectId  string
	repoName   string
	name       string
	urlParams_ gensupport.URLParams
	ctx_       context.Context
}

// Delete: Deletes a workspace. Uncommitted changes are lost. If the
// workspace does
// not exist, NOT_FOUND is returned. Returns ABORTED when the workspace
// is
// simultaneously modified by another client.
func (r *ProjectsReposWorkspacesService) Delete(projectId string, repoName string, name string) *ProjectsReposWorkspacesDeleteCall {
	c := &ProjectsReposWorkspacesDeleteCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repoName = repoName
	c.name = name
	return c
}

// CurrentSnapshotId sets the optional parameter "currentSnapshotId": If
// non-empty, current_snapshot_id must refer to the most recent update
// to
// the workspace, or ABORTED is returned.
func (c *ProjectsReposWorkspacesDeleteCall) CurrentSnapshotId(currentSnapshotId string) *ProjectsReposWorkspacesDeleteCall {
	c.urlParams_.Set("currentSnapshotId", currentSnapshotId)
	return c
}

// Uid sets the optional parameter "uid": A server-assigned, globally
// unique identifier.
func (c *ProjectsReposWorkspacesDeleteCall) Uid(uid string) *ProjectsReposWorkspacesDeleteCall {
	c.urlParams_.Set("uid", uid)
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposWorkspacesDeleteCall) Fields(s ...googleapi.Field) *ProjectsReposWorkspacesDeleteCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposWorkspacesDeleteCall) Context(ctx context.Context) *ProjectsReposWorkspacesDeleteCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposWorkspacesDeleteCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	var body io.Reader = nil
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("DELETE", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
		"repoName":  c.repoName,
		"name":      c.name,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.workspaces.delete" call.
// Exactly one of *Empty or error will be non-nil. Any non-2xx status
// code is an error. Response headers are in either
// *Empty.ServerResponse.Header or (if a response was returned at all)
// in error.(*googleapi.Error).Header. Use googleapi.IsNotModified to
// check whether the returned error was because http.StatusNotModified
// was returned.
func (c *ProjectsReposWorkspacesDeleteCall) Do(opts ...googleapi.CallOption) (*Empty, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &Empty{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Deletes a workspace. Uncommitted changes are lost. If the workspace does\nnot exist, NOT_FOUND is returned. Returns ABORTED when the workspace is\nsimultaneously modified by another client.",
	//   "flatPath": "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}",
	//   "httpMethod": "DELETE",
	//   "id": "source.projects.repos.workspaces.delete",
	//   "parameterOrder": [
	//     "projectId",
	//     "repoName",
	//     "name"
	//   ],
	//   "parameters": {
	//     "currentSnapshotId": {
	//       "description": "If non-empty, current_snapshot_id must refer to the most recent update to\nthe workspace, or ABORTED is returned.",
	//       "location": "query",
	//       "type": "string"
	//     },
	//     "name": {
	//       "description": "The unique name of the workspace within the repo.  This is the name\nchosen by the client in the Source API's CreateWorkspace method.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "projectId": {
	//       "description": "The ID of the project.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "repoName": {
	//       "description": "The name of the repo. Leave empty for the default repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "uid": {
	//       "description": "A server-assigned, globally unique identifier.",
	//       "location": "query",
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}",
	//   "response": {
	//     "$ref": "Empty"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.workspaces.get":

type ProjectsReposWorkspacesGetCall struct {
	s            *Service
	projectId    string
	repoName     string
	name         string
	urlParams_   gensupport.URLParams
	ifNoneMatch_ string
	ctx_         context.Context
}

// Get: Returns workspace metadata.
func (r *ProjectsReposWorkspacesService) Get(projectId string, repoName string, name string) *ProjectsReposWorkspacesGetCall {
	c := &ProjectsReposWorkspacesGetCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repoName = repoName
	c.name = name
	return c
}

// Uid sets the optional parameter "uid": A server-assigned, globally
// unique identifier.
func (c *ProjectsReposWorkspacesGetCall) Uid(uid string) *ProjectsReposWorkspacesGetCall {
	c.urlParams_.Set("uid", uid)
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposWorkspacesGetCall) Fields(s ...googleapi.Field) *ProjectsReposWorkspacesGetCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// IfNoneMatch sets the optional parameter which makes the operation
// fail if the object's ETag matches the given value. This is useful for
// getting updates only after the object has changed since the last
// request. Use googleapi.IsNotModified to check whether the response
// error from Do is the result of In-None-Match.
func (c *ProjectsReposWorkspacesGetCall) IfNoneMatch(entityTag string) *ProjectsReposWorkspacesGetCall {
	c.ifNoneMatch_ = entityTag
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposWorkspacesGetCall) Context(ctx context.Context) *ProjectsReposWorkspacesGetCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposWorkspacesGetCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	if c.ifNoneMatch_ != "" {
		reqHeaders.Set("If-None-Match", c.ifNoneMatch_)
	}
	var body io.Reader = nil
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("GET", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
		"repoName":  c.repoName,
		"name":      c.name,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.workspaces.get" call.
// Exactly one of *Workspace or error will be non-nil. Any non-2xx
// status code is an error. Response headers are in either
// *Workspace.ServerResponse.Header or (if a response was returned at
// all) in error.(*googleapi.Error).Header. Use googleapi.IsNotModified
// to check whether the returned error was because
// http.StatusNotModified was returned.
func (c *ProjectsReposWorkspacesGetCall) Do(opts ...googleapi.CallOption) (*Workspace, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &Workspace{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Returns workspace metadata.",
	//   "flatPath": "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}",
	//   "httpMethod": "GET",
	//   "id": "source.projects.repos.workspaces.get",
	//   "parameterOrder": [
	//     "projectId",
	//     "repoName",
	//     "name"
	//   ],
	//   "parameters": {
	//     "name": {
	//       "description": "The unique name of the workspace within the repo.  This is the name\nchosen by the client in the Source API's CreateWorkspace method.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "projectId": {
	//       "description": "The ID of the project.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "repoName": {
	//       "description": "The name of the repo. Leave empty for the default repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "uid": {
	//       "description": "A server-assigned, globally unique identifier.",
	//       "location": "query",
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}",
	//   "response": {
	//     "$ref": "Workspace"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.workspaces.list":

type ProjectsReposWorkspacesListCall struct {
	s            *Service
	projectId    string
	repoName     string
	urlParams_   gensupport.URLParams
	ifNoneMatch_ string
	ctx_         context.Context
}

// List: Returns all workspaces belonging to a repo.
func (r *ProjectsReposWorkspacesService) List(projectId string, repoName string) *ProjectsReposWorkspacesListCall {
	c := &ProjectsReposWorkspacesListCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repoName = repoName
	return c
}

// Uid sets the optional parameter "uid": A server-assigned, globally
// unique identifier.
func (c *ProjectsReposWorkspacesListCall) Uid(uid string) *ProjectsReposWorkspacesListCall {
	c.urlParams_.Set("uid", uid)
	return c
}

// View sets the optional parameter "view": Specifies which parts of the
// Workspace resource should be returned in the
// response.
//
// Possible values:
//   "STANDARD"
//   "MINIMAL"
//   "FULL"
func (c *ProjectsReposWorkspacesListCall) View(view string) *ProjectsReposWorkspacesListCall {
	c.urlParams_.Set("view", view)
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposWorkspacesListCall) Fields(s ...googleapi.Field) *ProjectsReposWorkspacesListCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// IfNoneMatch sets the optional parameter which makes the operation
// fail if the object's ETag matches the given value. This is useful for
// getting updates only after the object has changed since the last
// request. Use googleapi.IsNotModified to check whether the response
// error from Do is the result of In-None-Match.
func (c *ProjectsReposWorkspacesListCall) IfNoneMatch(entityTag string) *ProjectsReposWorkspacesListCall {
	c.ifNoneMatch_ = entityTag
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposWorkspacesListCall) Context(ctx context.Context) *ProjectsReposWorkspacesListCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposWorkspacesListCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	if c.ifNoneMatch_ != "" {
		reqHeaders.Set("If-None-Match", c.ifNoneMatch_)
	}
	var body io.Reader = nil
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos/{repoName}/workspaces")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("GET", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
		"repoName":  c.repoName,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.workspaces.list" call.
// Exactly one of *ListWorkspacesResponse or error will be non-nil. Any
// non-2xx status code is an error. Response headers are in either
// *ListWorkspacesResponse.ServerResponse.Header or (if a response was
// returned at all) in error.(*googleapi.Error).Header. Use
// googleapi.IsNotModified to check whether the returned error was
// because http.StatusNotModified was returned.
func (c *ProjectsReposWorkspacesListCall) Do(opts ...googleapi.CallOption) (*ListWorkspacesResponse, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &ListWorkspacesResponse{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Returns all workspaces belonging to a repo.",
	//   "flatPath": "v1/projects/{projectId}/repos/{repoName}/workspaces",
	//   "httpMethod": "GET",
	//   "id": "source.projects.repos.workspaces.list",
	//   "parameterOrder": [
	//     "projectId",
	//     "repoName"
	//   ],
	//   "parameters": {
	//     "projectId": {
	//       "description": "The ID of the project.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "repoName": {
	//       "description": "The name of the repo. Leave empty for the default repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "uid": {
	//       "description": "A server-assigned, globally unique identifier.",
	//       "location": "query",
	//       "type": "string"
	//     },
	//     "view": {
	//       "description": "Specifies which parts of the Workspace resource should be returned in the\nresponse.",
	//       "enum": [
	//         "STANDARD",
	//         "MINIMAL",
	//         "FULL"
	//       ],
	//       "location": "query",
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos/{repoName}/workspaces",
	//   "response": {
	//     "$ref": "ListWorkspacesResponse"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}

// method id "source.projects.repos.workspaces.modifyWorkspace":

type ProjectsReposWorkspacesModifyWorkspaceCall struct {
	s                      *Service
	projectId              string
	repoName               string
	name                   string
	modifyworkspacerequest *ModifyWorkspaceRequest
	urlParams_             gensupport.URLParams
	ctx_                   context.Context
}

// ModifyWorkspace: Applies an ordered sequence of file modification
// actions to a workspace.
// Returns ABORTED if current_snapshot_id in the request does not refer
// to
// the most recent update to the workspace or if the workspace
// is
// simultaneously modified by another client.
func (r *ProjectsReposWorkspacesService) ModifyWorkspace(projectId string, repoName string, name string, modifyworkspacerequest *ModifyWorkspaceRequest) *ProjectsReposWorkspacesModifyWorkspaceCall {
	c := &ProjectsReposWorkspacesModifyWorkspaceCall{s: r.s, urlParams_: make(gensupport.URLParams)}
	c.projectId = projectId
	c.repoName = repoName
	c.name = name
	c.modifyworkspacerequest = modifyworkspacerequest
	return c
}

// Fields allows partial responses to be retrieved. See
// https://developers.google.com/gdata/docs/2.0/basics#PartialResponse
// for more information.
func (c *ProjectsReposWorkspacesModifyWorkspaceCall) Fields(s ...googleapi.Field) *ProjectsReposWorkspacesModifyWorkspaceCall {
	c.urlParams_.Set("fields", googleapi.CombineFields(s))
	return c
}

// Context sets the context to be used in this call's Do method. Any
// pending HTTP request will be aborted if the provided context is
// canceled.
func (c *ProjectsReposWorkspacesModifyWorkspaceCall) Context(ctx context.Context) *ProjectsReposWorkspacesModifyWorkspaceCall {
	c.ctx_ = ctx
	return c
}

func (c *ProjectsReposWorkspacesModifyWorkspaceCall) doRequest(alt string) (*http.Response, error) {
	reqHeaders := make(http.Header)
	reqHeaders.Set("User-Agent", c.s.userAgent())
	var body io.Reader = nil
	body, err := googleapi.WithoutDataWrapper.JSONReader(c.modifyworkspacerequest)
	if err != nil {
		return nil, err
	}
	reqHeaders.Set("Content-Type", "application/json")
	c.urlParams_.Set("alt", alt)
	urls := googleapi.ResolveRelative(c.s.BasePath, "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}:modifyWorkspace")
	urls += "?" + c.urlParams_.Encode()
	req, _ := http.NewRequest("POST", urls, body)
	req.Header = reqHeaders
	googleapi.Expand(req.URL, map[string]string{
		"projectId": c.projectId,
		"repoName":  c.repoName,
		"name":      c.name,
	})
	if c.ctx_ != nil {
		return ctxhttp.Do(c.ctx_, c.s.client, req)
	}
	return c.s.client.Do(req)
}

// Do executes the "source.projects.repos.workspaces.modifyWorkspace" call.
// Exactly one of *Workspace or error will be non-nil. Any non-2xx
// status code is an error. Response headers are in either
// *Workspace.ServerResponse.Header or (if a response was returned at
// all) in error.(*googleapi.Error).Header. Use googleapi.IsNotModified
// to check whether the returned error was because
// http.StatusNotModified was returned.
func (c *ProjectsReposWorkspacesModifyWorkspaceCall) Do(opts ...googleapi.CallOption) (*Workspace, error) {
	gensupport.SetOptions(c.urlParams_, opts...)
	res, err := c.doRequest("json")
	if res != nil && res.StatusCode == http.StatusNotModified {
		if res.Body != nil {
			res.Body.Close()
		}
		return nil, &googleapi.Error{
			Code:   res.StatusCode,
			Header: res.Header,
		}
	}
	if err != nil {
		return nil, err
	}
	defer googleapi.CloseBody(res)
	if err := googleapi.CheckResponse(res); err != nil {
		return nil, err
	}
	ret := &Workspace{
		ServerResponse: googleapi.ServerResponse{
			Header:         res.Header,
			HTTPStatusCode: res.StatusCode,
		},
	}
	target := &ret
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		return nil, err
	}
	return ret, nil
	// {
	//   "description": "Applies an ordered sequence of file modification actions to a workspace.\nReturns ABORTED if current_snapshot_id in the request does not refer to\nthe most recent update to the workspace or if the workspace is\nsimultaneously modified by another client.",
	//   "flatPath": "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}:modifyWorkspace",
	//   "httpMethod": "POST",
	//   "id": "source.projects.repos.workspaces.modifyWorkspace",
	//   "parameterOrder": [
	//     "projectId",
	//     "repoName",
	//     "name"
	//   ],
	//   "parameters": {
	//     "name": {
	//       "description": "The unique name of the workspace within the repo.  This is the name\nchosen by the client in the Source API's CreateWorkspace method.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "projectId": {
	//       "description": "The ID of the project.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     },
	//     "repoName": {
	//       "description": "The name of the repo. Leave empty for the default repo.",
	//       "location": "path",
	//       "required": true,
	//       "type": "string"
	//     }
	//   },
	//   "path": "v1/projects/{projectId}/repos/{repoName}/workspaces/{name}:modifyWorkspace",
	//   "request": {
	//     "$ref": "ModifyWorkspaceRequest"
	//   },
	//   "response": {
	//     "$ref": "Workspace"
	//   },
	//   "scopes": [
	//     "https://www.googleapis.com/auth/cloud-platform"
	//   ]
	// }

}
