/*
  One person, one email, enforced by the database.

  The app already lower-cases every address it saves. This makes the database refuse anything else, so even a
  direct write (a script, a future code path) can't create "Eve@x.com" next to "eve@x.com": with only lower-case
  values allowed, the existing unique index on User.email now means "unique ignoring capitals".
  (The previous migration lower-cased the existing addresses.)
*/
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower("email"));
