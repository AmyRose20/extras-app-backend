require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const callRequestRoutes = require('./routes/callRequest.routes');
const callInviteRoutes = require('./routes/callInvite.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/profiles', profileRoutes);
app.use('/call-requests', callRequestRoutes);
app.use('/invites', callInviteRoutes);

// Basic 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Extras App API running on http://localhost:${PORT}`);
});
