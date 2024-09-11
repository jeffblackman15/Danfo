const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const app = express();

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/Danfo')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('MongoDB connection error:', err));

// Define User Schema
const User = require('./models/User');
const Transaction = require('./models/Transaction');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true,
}));

app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

// Handle Registration
app.post('/register', async (req, res) => {
    const { name, email, password, password2 } = req.body;
    let errors = [];

    if (!name || !email || !password || !password2) {
        errors.push('Please fill in all fields');
    }

    if (password !== password2) {
        errors.push('Passwords do not match');
    }

    if (password.length < 6) {
        errors.push('Password should be at least 6 characters');
    }

    if (errors.length > 0) {
        res.render('register', { errors });
    } else {
        try {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                errors.push('Email already exists');
                res.render('register', { errors });
            } else {
                const hashedPassword = await bcrypt.hash(password, 10);
                const newUser = new User({
                    name,
                    email,
                    password: hashedPassword
                });
                await newUser.save();
                req.session.success_msg = 'You are now registered and can log in';
                res.redirect('/');
            }
        } catch (err) {
            errors.push('An error occurred, please try again');
            res.render('register', { errors });
        }
    }
});

// Handle Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.redirect('/register');
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            // If the password matches, log in the user
            req.session.user = user;
            return res.redirect('/dashboard');
        } else {
            // If the password is incorrect, show an error message
            return res.render('login', {
                error_msg: 'Incorrect email or password',
                email // Preserves the email input
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Dashboard Route
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        res.redirect('/');
    } else {
        res.render('dashboard');
    }
});

app.get('/trips', (req, res) => {
    const trips = [
        { origin: 'Lagos', destination: 'Ibadan', date: '2023-09-09', price: 50, mode: 'Bus' },
        { origin: 'Ikeja', destination: 'Lekki', date: '2023-09-10', price: 20, mode: 'Bike' },

    ];

    res.render('trips', { trips });
});

// Wallet Route
app.get('/payment', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    try {
        const transactions = await Transaction.find({ userId: req.session.user._id });
        const balance = transactions.reduce((acc, transaction) => {
            return transaction.type === 'Deposit' ? acc + transaction.amount : acc - transaction.amount;
        }, 0);

        res.render('payment', { balance, transactions });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Handle Deposit
app.post('/deposit', async (req, res) => {
    const { amount } = req.body;
    const userId = req.session.user._id;

    if (!amount || amount <= 0) {
        return res.redirect('/payment');
    }

    try {
        const newTransaction = new Transaction({
            userId,
            type: 'Deposit',
            amount: parseFloat(amount)
        });
        await newTransaction.save();
        res.redirect('/payment');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Handle Withdraw
app.post('/withdraw', async (req, res) => {
    const { amount } = req.body;
    const userId = req.session.user._id;

    if (!amount || amount <= 0) {
        return res.redirect('/payment');
    }

    try {
        const transactions = await Transaction.find({ userId });
        const balance = transactions.reduce((acc, transaction) => {
            return transaction.type === 'Deposit' ? acc + transaction.amount : acc - transaction.amount;
        }, 0);

        if (parseFloat(amount) > balance) {
            return res.redirect('/payment'); // Insufficient funds
        }

        const newTransaction = new Transaction({
            userId,
            type: 'Withdraw',
            amount: parseFloat(amount)
        });
        await newTransaction.save();
        res.redirect('/payment');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Handle Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            res.status(500).send('Server Error');
        } else {
            res.redirect('/');
        }
    });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
