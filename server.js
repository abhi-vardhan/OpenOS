const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const session = require('express-session');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Serve static files from the "public" directory
app.use(express.static('public'));

// Configure session middleware
app.use(session({ secret: 'your-secret-key', resave: false, saveUninitialized: true }));

// Initialize Passport and restore authentication state, if any, from the session
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/github/callback"
},
    (accessToken, refreshToken, profile, done) => {
        profile.accessToken = accessToken;
        return done(null, profile);
    }
));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/auth/github',
    passport.authenticate('github', { scope: ['user:email'] })
);

app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/profile');
    }
);

app.get('/profile', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.sendFile(__dirname + '/public/profile.html');
});

app.get('/user-data', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const headers = { Authorization: `token ${req.user.accessToken}` };

        const [pullRequestsResponse, issuesResponse, reposResponse] = await Promise.all([
            axios.get('https://api.github.com/search/issues', {
                headers,
                params: { q: `author:${req.user.username} type:pr state:open` }
            }),
            axios.get('https://api.github.com/search/issues', {
                headers,
                params: { q: `author:${req.user.username} type:issue state:open` }
            }),
            axios.get(`https://api.github.com/users/${req.user.username}/repos`, { headers })
        ]);

        const repos = reposResponse.data;
        const commitsPromises = repos.map(repo => axios.get(`https://api.github.com/repos/${req.user.username}/${repo.name}/commits`, { headers }));
        const commitsResponses = await Promise.all(commitsPromises);

        const totalCommits = commitsResponses.reduce((sum, response) => sum + response.data.length, 0);

        const userData = {
            username: req.user.username,
            profilePicture: req.user.photos[0].value, // Get the profile picture from the GitHub profile
            pullRequests: pullRequestsResponse.data.items,
            issues: issuesResponse.data.items,
            totalCommits
        };

        console.log('User Data:', userData);

        res.json(userData);
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
