// Password Constants

// PASSWORD_PATTERN is the regex that represents the allowed passwords for the signup and reset password pages.
export const PASSWORD_PATTERN = "^(?!.*(.)\\1{2})(?=.*[^A-Za-z\d])(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{10,128}$";

// PASSWORD_DESCRIPTION is the "english" description of the password requirements enforced by PASSWORD_PATTERN.
export const PASSWORD_DESCRIPTION = `Your password should be between 10 and 128 characters (with no more than two identical characters in a row), and should include at least: 
- 1 uppercase character 
- 1 lowercase character
- 1 digit
- 1 special character`;
