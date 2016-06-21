package backend

import (
	"net/http"
	"reflect"
	"testing"

	"golang.org/x/net/context"

	gogithub "github.com/sourcegraph/go-github/github"
	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/services/ext/github"
	"sourcegraph.com/sourcegraph/sourcegraph/services/platform"
)

func TestReposService_Get(t *testing.T) {
	var s repos
	ctx, mock := testContext()

	wantRepo := &sourcegraph.Repo{
		ID:      1,
		URI:     "r",
		HTMLURL: "http://example.com/r",

		Permissions: &sourcegraph.RepoPermissions{Pull: true, Push: true},
	}

	calledGet := mock.stores.Repos.MockGet_Return(t, wantRepo)

	repo, err := s.Get(ctx, &sourcegraph.RepoSpec{ID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !*calledGet {
		t.Error("!calledGet")
	}
	if !reflect.DeepEqual(repo, wantRepo) {
		t.Errorf("got %+v, want %+v", repo, wantRepo)
	}
}

func TestRepos_Create_New(t *testing.T) {
	var s repos
	ctx, mock := testContext()

	wantRepo := &sourcegraph.Repo{
		ID:      1,
		URI:     "r",
		Name:    "r",
		HTMLURL: "http://example.com/r",
	}

	calledCreate := false
	mock.stores.Repos.Create_ = func(ctx context.Context, repo *sourcegraph.Repo) (int32, error) {
		calledCreate = true
		if repo.URI != wantRepo.URI {
			t.Errorf("got uri %#v, want %#v", repo.URI, wantRepo.URI)
		}
		return wantRepo.ID, nil
	}
	mock.stores.Repos.MockGet(t, 1)

	_, err := s.Create(ctx, &sourcegraph.ReposCreateOp{
		Op: &sourcegraph.ReposCreateOp_New{New: &sourcegraph.ReposCreateOp_NewRepo{
			URI: "r",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !calledCreate {
		t.Error("!calledCreate")
	}
}

func TestRepos_Create_Origin(t *testing.T) {
	var s repos
	ctx, mock := testContext()

	wantRepo := &sourcegraph.Repo{
		ID:      1,
		URI:     "github.com/a/b",
		HTMLURL: "http://example.com/github.com/a/b",
		Origin: &sourcegraph.Origin{
			ID:         "123",
			Service:    sourcegraph.Origin_GitHub,
			APIBaseURL: "https://api.github.com",
		},
	}

	calledGet := false
	client := gogithub.NewClient(&http.Client{})
	ctx = github.NewContextWithMockClient(ctx, true, client, client, mockGitHubRepos{
		GetByID_: func(id int) (*gogithub.Repository, *gogithub.Response, error) {
			if want := 123; id != want {
				t.Errorf("got id %d, want %d", id, want)
			}
			calledGet = true
			return &gogithub.Repository{
				ID:       gogithub.Int(123),
				Name:     gogithub.String("repo"),
				FullName: gogithub.String("owner/repo"),
				Owner:    &gogithub.User{ID: gogithub.Int(1)},
				CloneURL: gogithub.String("https://github.com/owner/repo.git"),
				Private:  gogithub.Bool(false),
			}, nil, nil
		}})

	calledCreate := false
	mock.stores.Repos.Create_ = func(ctx context.Context, repo *sourcegraph.Repo) (int32, error) {
		calledCreate = true
		if !reflect.DeepEqual(repo.Origin, wantRepo.Origin) {
			t.Errorf("got repo origin %#v, want %#v", repo.Origin, wantRepo.Origin)
		}
		return wantRepo.ID, nil
	}
	mock.stores.Repos.MockGet(t, 1)

	_, err := s.Create(ctx, &sourcegraph.ReposCreateOp{
		Op: &sourcegraph.ReposCreateOp_Origin{Origin: wantRepo.Origin},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !calledGet {
		t.Error("!calledGet")
	}
	if !calledCreate {
		t.Error("!calledCreate")
	}
}

func TestReposService_List(t *testing.T) {
	var s repos
	ctx, mock := testContext()

	wantRepos := &sourcegraph.RepoList{
		Repos: []*sourcegraph.Repo{
			{URI: "r1", HTMLURL: "http://example.com/r1"},
			{URI: "r2", HTMLURL: "http://example.com/r2"},
		},
	}

	calledList := mock.stores.Repos.MockList(t, "r1", "r2")

	repos, err := s.List(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !*calledList {
		t.Error("!calledList")
	}
	if !reflect.DeepEqual(repos, wantRepos) {
		t.Errorf("got %+v, want %+v", repos, wantRepos)
	}
}

func TestReposService_GetConfig(t *testing.T) {
	var s repos
	ctx, mock := testContext()

	wantRepoConfig := &sourcegraph.RepoConfig{
		Apps: []string{"a", "b"},
	}

	mock.stores.Repos.MockGetByURI(t, "r", 1)
	calledConfigsGet := mock.stores.RepoConfigs.MockGet_Return(t, 1, wantRepoConfig)

	conf, err := s.GetConfig(ctx, &sourcegraph.RepoSpec{ID: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !*calledConfigsGet {
		t.Error("!calledConfigsGet")
	}
	if !reflect.DeepEqual(conf, wantRepoConfig) {
		t.Errorf("got %+v, want %+v", conf, wantRepoConfig)
	}
}

func TestReposService_ConfigureApp_Enable(t *testing.T) {
	var s repos
	ctx, mock := testContext()

	// Add dummy app.
	platform.Apps["b"] = struct{}{}
	defer func() {
		delete(platform.Apps, "b")
	}()

	mock.stores.Repos.MockGetByURI(t, "r", 1)
	calledConfigsGet := mock.stores.RepoConfigs.MockGet_Return(t, 1, &sourcegraph.RepoConfig{Apps: []string{"a"}})
	var calledConfigsUpdate bool
	mock.stores.RepoConfigs.Update_ = func(ctx context.Context, repo int32, conf sourcegraph.RepoConfig) error {
		if want := []string{"a", "b"}; !reflect.DeepEqual(conf.Apps, want) {
			t.Errorf("got %#v, want Apps %v", conf, want)
		}
		calledConfigsUpdate = true
		return nil
	}

	_, err := s.ConfigureApp(ctx, &sourcegraph.RepoConfigureAppOp{
		Repo:   1,
		App:    "b",
		Enable: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !*calledConfigsGet {
		t.Error("!calledConfigsGet")
	}
	if !calledConfigsUpdate {
		t.Error("!calledConfigsUpdate")
	}
}

func TestReposService_ConfigureApp_Disable(t *testing.T) {
	var s repos
	ctx, mock := testContext()

	// Add dummy app.
	platform.Apps["b"] = struct{}{}
	defer func() {
		delete(platform.Apps, "b")
	}()

	mock.stores.Repos.MockGetByURI(t, "r", 1)
	calledConfigsGet := mock.stores.RepoConfigs.MockGet_Return(t, 1, &sourcegraph.RepoConfig{Apps: []string{"a", "b"}})
	var calledConfigsUpdate bool
	mock.stores.RepoConfigs.Update_ = func(ctx context.Context, repo int32, conf sourcegraph.RepoConfig) error {
		if want := []string{"a"}; !reflect.DeepEqual(conf.Apps, want) {
			t.Errorf("got %#v, want Apps %v", conf, want)
		}
		calledConfigsUpdate = true
		return nil
	}

	_, err := s.ConfigureApp(ctx, &sourcegraph.RepoConfigureAppOp{
		Repo:   1,
		App:    "b",
		Enable: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !*calledConfigsGet {
		t.Error("!calledConfigsGet")
	}
	if !calledConfigsUpdate {
		t.Error("!calledConfigsUpdate")
	}
}

type mockGitHubRepos struct {
	Get_     func(owner, repo string) (*gogithub.Repository, *gogithub.Response, error)
	GetByID_ func(id int) (*gogithub.Repository, *gogithub.Response, error)
	List_    func(user string, opt *gogithub.RepositoryListOptions) ([]gogithub.Repository, *gogithub.Response, error)
}

func (s mockGitHubRepos) Get(owner, repo string) (*gogithub.Repository, *gogithub.Response, error) {
	return s.Get_(owner, repo)
}

func (s mockGitHubRepos) GetByID(id int) (*gogithub.Repository, *gogithub.Response, error) {
	return s.GetByID_(id)
}

func (s mockGitHubRepos) List(user string, opt *gogithub.RepositoryListOptions) ([]gogithub.Repository, *gogithub.Response, error) {
	return s.List_(user, opt)
}
