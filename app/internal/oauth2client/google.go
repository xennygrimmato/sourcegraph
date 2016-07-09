package oauth2client

import (
	"bytes"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/shurcooL/go-goon"

	"google.golang.org/api/cloudresourcemanager/v1beta1"
	googleoauth2 "google.golang.org/api/oauth2/v2"

	"gopkg.in/inconshreveable/log15.v2"

	"golang.org/x/net/context"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"sourcegraph.com/sourcegraph/sourcegraph/api/sourcegraph"
	"sourcegraph.com/sourcegraph/sourcegraph/app/internal"
	"sourcegraph.com/sourcegraph/sourcegraph/app/internal/canonicalurl"
	"sourcegraph.com/sourcegraph/sourcegraph/app/internal/returnto"
	"sourcegraph.com/sourcegraph/sourcegraph/app/internal/schemautil"
	"sourcegraph.com/sourcegraph/sourcegraph/app/router"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/auth"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/conf"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/errcode"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/google.golang.org/api/source/v1"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/handlerutil"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/httputil/httpctx"
	"sourcegraph.com/sourcegraph/sourcegraph/pkg/oauth2util"
)

var (
	googleNonceCookiePath = router.Rel.URLTo(router.GoogleOAuth2Receive).Path

	googleClientID     = os.Getenv("GOOGLE_CLIENT_ID")
	googleClientSecret = os.Getenv("GOOGLE_CLIENT_SECRET")
)

func init() {
	internal.Handlers[router.GoogleOAuth2Initiate] = internal.Handler(serveGoogleOAuth2Initiate)
	internal.Handlers[router.GoogleOAuth2Receive] = internal.Handler(serveGoogleOAuth2Receive)
}

// serveGoogleOAuth2Initiate generates the OAuth2 authorize URL
// (including a nonce state value, also stored in a cookie) and
// redirects the client to that URL.
func serveGoogleOAuth2Initiate(w http.ResponseWriter, r *http.Request) error {
	returnTo, err := returnto.URLFromRequest(r)
	if err != nil {
		log15.Warn("Invalid return-to URL provided to OAuth2 flow initiation; ignoring.", "err", err)
	}

	// Remove UTM campaign params to avoid double
	// attribution. TODO(sqs): consider doing this on the frontend in
	// JS so we centralize usage analytics there.
	returnTo = canonicalurl.FromURL(returnTo)

	nonce, err := writeNonceCookie(w, r, googleNonceCookiePath)
	if err != nil {
		return err
	}

	var scopes []string
	/*if s := r.URL.Query().Get("scopes"); s == "" {
		// scopes remains nil, and the Google OAuth2 flow authorizes
		// either no scopes or the previously authorized scopes to
		// this application.
	} else {
		scopes = strings.Split(s, ",")
	}*/
	scopes = []string{
		googleoauth2.UserinfoProfileScope,
		googleoauth2.UserinfoEmailScope,

		source.CloudPlatformScope, // For source.projects.repos.list method.
	}

	destURL, err := googleOAuthLoginURL(r, oauthAuthorizeClientState{Nonce: nonce, ReturnTo: returnTo.String()}, scopes)
	if err != nil {
		return err
	}

	http.Redirect(w, r, destURL.String(), http.StatusSeeOther)
	return nil
}

// TODO: Maybe factor out common part.
func googleOAuthLoginURL(r *http.Request, state oauthAuthorizeClientState, scopes []string) (*url.URL, error) {
	ctx := httpctx.FromRequest(r)

	stateText, err := state.MarshalText()
	if err != nil {
		return nil, err
	}

	return url.Parse(googleOAuth2Config(ctx, scopes).AuthCodeURL(string(stateText)))
}

func googleOAuth2Config(ctx context.Context, scopes []string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     googleClientID,
		ClientSecret: googleClientSecret,
		Endpoint:     google.Endpoint,
		RedirectURL:  conf.AppURL(ctx).ResolveReference(router.Rel.URLTo(router.GoogleOAuth2Receive)).String(),
		Scopes:       scopes,
	}
}

func serveGoogleOAuth2Receive(w http.ResponseWriter, r *http.Request) (err error) {
	defer func() {
		if err != nil {
			log15.Error("Error in receive handler in Google OAuth2 auth flow (suppressing HTTP 500 and returning redirect to non-Google login form).", "err", err)
			http.Redirect(w, r, "/login?google-login-error=unknown&_event=FailedGoogleOAuth2Flow", http.StatusSeeOther)
			err = nil
		}
	}()

	ctx, cl := handlerutil.Client(r)

	actor := auth.ActorFromContext(ctx)

	_, _, _ = ctx, cl, actor // TODO: Use or remove.

	var opt oauth2util.ReceiveParams
	if err := schemautil.Decode(&opt, r.URL.Query()); err != nil {
		return err
	}

	// Check the state nonce against what's stored in the cookie (to
	// prevent CSRF).
	var state oauthAuthorizeClientState
	if err := state.UnmarshalText([]byte(opt.State)); err != nil {
		return &errcode.HTTPErr{Status: http.StatusBadRequest, Err: err}
	}
	nonce, present := nonceFromCookie(r)
	deleteNonceCookie(w, googleNonceCookiePath) // prevent reuse of nonce
	if !present || nonce != state.Nonce || nonce == "" {
		return &errcode.HTTPErr{Status: http.StatusForbidden, Err: errors.New("invalid state nonce from OAuth2 provider")}
	}

	/*tok, err := cl.Auth.GetAccessToken(ctx, &sourcegraph.AccessTokenRequest{
		AuthorizationGrant: &sourcegraph.AccessTokenRequest_GoogleAuthCode{
			GoogleAuthCode: &sourcegraph.GoogleAuthCode{
				Code: opt.Code,
				Host: "google.com",
			},
		},
	})
	if err != nil {
		return err
	}

	googleUser := tok.GoogleUser
	_ = googleUser // TODO: Use or remove.*/

	// TODO: Debug code.
	{
		var buf bytes.Buffer
		//defer io.Copy(w, &buf)

		if opt.Code == "" {
			return fmt.Errorf("code cannot be empty")
		}

		// TODO: Is this needed?
		scopes := []string{
			googleoauth2.UserinfoProfileScope,
			googleoauth2.UserinfoEmailScope,

			source.CloudPlatformScope, // For source.projects.repos.list method.
		}

		// Exchange the code for a Google access token.
		token, err := googleOAuth2Config(ctx, scopes).Exchange(oauth2.NoContext, opt.Code)
		if err != nil {
			return err
		}
		if !token.Valid() {
			return fmt.Errorf("exchanging auth code yielded invalid Google OAuth2 token")
		}

		goon.FdumpExpr(&buf, token)

		// Get the current user.
		{
			resp, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + token.AccessToken)
			if err != nil {
				return nil
			}
			contents, err := ioutil.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				return nil
			}
			fmt.Fprintf(&buf, "Content: %v\n%s\n", resp.Status, contents)
		}

		{
			const projectID = "my-test-project"
			resp, err := http.Get("https://www.googleapis.com/source/v1/projects/" + projectID + "/repos?access_token=" + token.AccessToken)
			if err != nil {
				return nil
			}
			contents, err := ioutil.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				return nil
			}
			fmt.Fprintf(&buf, "Content: %v\n%s\n\n", resp.Status, contents)
		}

		ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token.AccessToken})
		client := oauth2.NewClient(ctx, ts)
		/*client, err := google.DefaultClient(ctx, scopes...)
		if err != nil {
			return err
		}*/
		var me *googleoauth2.Userinfoplus
		{
			oauth2Service, err := googleoauth2.New(client)
			if err != nil {
				return err
			}
			me, err = oauth2Service.Userinfo.Get().Do()
			if err != nil {
				return err
			}
			goon.FdumpExpr(&buf, me)
		}

		// TODO: Debug.
		if true && actor.IsAuthenticated() {
			/*_, err = cl.Auth.SetExternalToken(ctx, &sourcegraph.ExternalToken{
				UID:      sgUID,
				Host:     githubcli.Config.Host(),
				Token:    tok.GitHubAccessToken,
				Scope:    strings.Join(tok.Scope, ","),
				ClientID: googleClientID,
				ExtUID:   me.ID,
			})
			if err != nil {
				return &errcode.HTTPErr{Status: http.StatusBadRequest, Err: err}
			}*/

			googleID, err := strconv.ParseUint(me.Id, 10, 64)
			if err != nil {
				//return err
				fmt.Println(err)
			}

			_, err = cl.Auth.SetExternalToken(ctx, &sourcegraph.ExternalToken{
				UID:      int32(actor.UID),
				Host:     "source.developers.google.com",
				Token:    token.AccessToken,
				Scope:    strings.Join(scopes, ","),
				ClientID: googleClientID,
				ExtUID:   int32(googleID),
			})
			if err != nil {
				return err
			}
		}

		if false {
			{
				cloudresourcemanagerService, err := cloudresourcemanager.New(client)
				if err != nil {
					return err
				}
				projects, err := cloudresourcemanagerService.Projects.List().Do()
				if err != nil {
					fmt.Println(err)
					return err
				}
				goon.FdumpExpr(&buf, projects)
			}

			{
				sourceService, err := source.New(client)
				if err != nil {
					return err
				}
				repos, err := sourceService.Projects.Repos.List("my-test-project").Do()
				if err != nil {
					fmt.Println(err)
					return err
				}
				goon.FdumpExpr(&buf, repos)
			}
		}

		fmt.Fprintln(&buf, "okay all done")
	}

	// TODO: The rest.

	http.Redirect(w, r, "/settings/accounts", http.StatusSeeOther)
	return nil
}
