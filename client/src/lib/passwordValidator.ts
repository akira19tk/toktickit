// Client-side password validator mirroring BR-09.
// The server is always authoritative; this provides instant feedback only.

export interface PasswordErrors {
  tooShort?: string;
  tooManyBytes?: string;
  noLetter?: string;
  noDigit?: string;
  sameAsCurrent?: string;
  confirmMismatch?: string;
}

export interface ValidatePasswordOptions {
  currentPassword?: string;
  confirmPassword?: string;
}

export function validatePassword(
  password: string,
  options: ValidatePasswordOptions = {}
): PasswordErrors {
  const errors: PasswordErrors = {};

  if (password.length < 8) {
    errors.tooShort = "Password must be at least 8 characters.";
  }

  const bytes = new TextEncoder().encode(password).length;
  if (bytes > 72) {
    errors.tooManyBytes = "Password must be at most 72 bytes (about 24 Thai characters).";
  }

  if (!/\p{L}/u.test(password)) {
    errors.noLetter = "Password must contain at least one letter.";
  }

  if (!/\d/.test(password)) {
    errors.noDigit = "Password must contain at least one digit.";
  }

  if (options.currentPassword !== undefined && password === options.currentPassword) {
    errors.sameAsCurrent = "New password must differ from the current password.";
  }

  if (options.confirmPassword !== undefined && password !== options.confirmPassword) {
    errors.confirmMismatch = "Passwords do not match.";
  }

  return errors;
}

export function isPasswordValid(errors: PasswordErrors): boolean {
  return Object.keys(errors).length === 0;
}
