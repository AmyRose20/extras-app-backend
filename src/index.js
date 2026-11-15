require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const callRequestRoutes = require('./routes/callRequest.routes');
const callInviteRoutes = require('./routes/callInvite.routes');
const shootDayRoutes = require('./routes/shootDay.routes');
const deletionRequestRoutes = require('./routes/deletionRequest.routes');
const productionRequestRoutes = require('./routes/productionRequest.routes');
const badgeRoutes = require('./routes/badge.routes');
const productionRoutes = require('./routes/production.routes');
const locationRoutes = require('./routes/location.routes');
const geocodeRoutes = require('./routes/geocode.routes');
const placesRoutes = require('./routes/places.routes');
const emailLinkRoutes = require('./routes/emailLink.routes');
const signupInviteRoutes = require('./routes/signupInvite.routes');
const signupRoutes = require('./routes/signup.routes');
const detailsRoutes = require('./routes/details.routes');
const profileOptionsRoutes = require('./routes/profileOptions.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // reads forms posted from the web pages (email answers, sign-up)

// Files for the web pages, e.g. /static/styles.css (from the public folder)
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/profiles', profileRoutes);
app.use('/call-requests', callRequestRoutes);
app.use('/invites', callInviteRoutes);
app.use('/shoot-days', shootDayRoutes);
app.use('/deletion-requests', deletionRequestRoutes);
app.use('/production-requests', productionRequestRoutes);
app.use('/badges', badgeRoutes);
app.use('/productions', productionRoutes);
app.use('/locations', locationRoutes);
app.use('/geocode', geocodeRoutes);
app.use('/places', placesRoutes);
app.use('/email', emailLinkRoutes);
app.use('/signup-invites', signupInviteRoutes);
app.use('/signup', signupRoutes);
app.use('/details', detailsRoutes);
app.use('/profile-options', profileOptionsRoutes);

// Basic 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Extras App API running on http://localhost:${PORT}`);
});
