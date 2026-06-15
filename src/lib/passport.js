const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const prisma = require('../lib/prisma');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'dummy',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy',
    callbackURL: "http://localhost:3000/api/auth/google/callback"
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      // Find or create user
      let user = await prisma.user.findFirst({
        where: { googleId: profile.id }
      });

      if (!user) {
        // Also check if email exists to link account
        const email = profile.emails[0].value;
        user = await prisma.user.findUnique({ where: { email } });

        if (user) {
          // Link google id to existing email
          user = await prisma.user.update({
            where: { email },
            data: { googleId: profile.id }
          });
        } else {
          // Create new user
          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email: email,
              name: profile.displayName
            }
          });
        }
      }
      return cb(null, user);
    } catch (error) {
      return cb(error, null);
    }
  }
));

module.exports = passport;
