package sourcegraph

import "fmt"

func (u *User) Spec() UserSpec {
	return UserSpec{Login: u.Login, UID: u.UID}
}

// AvatarURLOfSize returns the URL to an avatar for the user with the
// given width (in pixels).
func (u *User) AvatarURLOfSize(width int) string {
	return avatarURLOfSize(u.AvatarURL, width)
}

func avatarURLOfSize(avatarURL string, width int) string {
	// Default avatar.
	if avatarURL == "" {
		avatarURL = "https://secure.gravatar.com/avatar?d=mm&f=y"
	}
	return avatarURL + fmt.Sprintf("&s=%d", width)
}

// Person returns an equivalent Person.
func (u *User) Person() *Person {
	return &Person{
		PersonSpec: PersonSpec{UID: u.UID, Login: u.Login},
		FullName:   u.Name,
		AvatarURL:  u.AvatarURL,
	}
}

// InBeta tells whether or not the given user is in the given beta.
func (u *User) InBeta(beta string) bool {
	for _, b := range u.Betas {
		if b == beta {
			return true
		}
	}
	return false
}

// InAnyBeta tells whether or not the given user is in any beta program.
func (u *User) InAnyBeta() bool {
	return len(u.Betas) > 0
}

// BetaPending tells if the given user is registered for beta access but is not
// yet participating in any beta programs.
func (u *User) BetaPending() bool {
	return u.BetaRegistered && len(u.Betas) == 0
}
