import { HttpException, HttpStatus } from '@nestjs/common';

/** Actions that spend money or reach other people need an address we know belongs to the person. */
export function requireVerifiedEmail(user: { email_verified?: boolean }) {
  if (user.email_verified === false) {
    throw new HttpException(
      { statusCode: HttpStatus.FORBIDDEN, code: 'EMAIL_NOT_VERIFIED', message: 'Confirm your email address first. We sent you a link when you signed up, and you can ask for another in your account settings.' },
      HttpStatus.FORBIDDEN,
    );
  }
}
