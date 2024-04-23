const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

const User = require('../models/user.js');

exports.signup = async (req, res, next) => {
  const name = req.body.name;
  const email = req.body.email;
  const password = req.body.password;

  const errors = validationResult(req);
  try {
    if (!errors.isEmpty()) {
      const err = new Error('Invalid inputs');
      err.statusCode = 422;
      throw err;
    }
    const hashedPass = await bcrypt.hash(password, 12);
    const user = new User({ name, email, password: hashedPass });
    const result = await user.save();
    res.status(201).json({ message: 'user created!', userId: result._id });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;

  try {
    const user = await User.findOne({ email: email });
    if (!user) {
      const err = new Error('email not found');
      err.statusCode = 401;
      throw err;
    }

    const doMatch = await bcrypt.compare(password, user.password);
    if (!doMatch) {
      const err = new Error('email not found');
      err.statusCode = 401;
      throw err;
    }

    // generate token in login after checking the email and password
    const token = jwt.sign(
      {
        email: user.email,
        userId: user._id.toString(),
      },
      'somesupersecretsecret',
      { expiresIn: '1h' } // expiry time
    );

    res.status(200).json({ token, userId: user._id.toString() });
  } catch (err) {
    next(err);
  }
};

exports.getUserStatus = (req, res, next) => {
  res.status(200).json({ status: req.user.status });
  // User.findById(req.user._id)
  //   .then(user => {
  //     if (!user) {
  //       const error = new Error('User not found.');
  //       error.statusCode = 404;
  //       throw error;
  //     }
  //     res.status(200).json({ status: user.status });
  //   })
  //   .catch(err => {
  //     if (!err.statusCode) {
  //       err.statusCode = 500;
  //     }
  //     next(err);
  //   });
};

exports.updateUserStatus = async (req, res, next) => {
  const newStatus = req.body.status;
  try {
    req.user.status = newStatus;
    await req.user.save();
    res.status(200).json({ message: 'User updated.' });
  } catch (err) {
    next(err);
  }
};
