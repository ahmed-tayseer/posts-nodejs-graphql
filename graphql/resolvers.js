const fs = require('fs');

const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
const Post = require('../models/post');

const throwError = (message, code, data) => {
  const err = new Error(message);
  err.code = code;
  err.data = data;
  throw err;
};

module.exports = {
  createUser: async function ({ userInput }, req) {
    //   const email = args.userInput.email;
    const errors = [];
    if (!validator.isEmail(userInput.email)) {
      errors.push({ message: 'E-Mail is invalid.' });
    }
    if (
      validator.isEmpty(userInput.password) ||
      !validator.isLength(userInput.password, { min: 5 })
    ) {
      errors.push({ message: 'Password too short!' });
    }
    if (errors.length > 0) {
      const error = new Error('Invalid input.');
      error.data = errors;
      error.code = 422;
      throw error;
    }
    const existingUser = await User.findOne({ email: userInput.email });
    if (existingUser) {
      const error = new Error('User exists already!');
      throw error;
    }
    const hashedPw = await bcrypt.hash(userInput.password, 12);
    const user = new User({
      email: userInput.email,
      name: userInput.name,
      password: hashedPw,
    });
    const createdUser = await user.save();
    return { ...createdUser._doc, _id: createdUser._id.toString() };
  },

  login: async function ({ email, password }) {
    const user = await User.findOne({ email: email });
    if (!user) {
      const error = new Error('User not found.');
      error.code = 401;
      throw error;
    }
    const isEqual = await bcrypt.compare(password, user.password);
    if (!isEqual) {
      const error = new Error('Password is incorrect.');
      error.code = 401;
      throw error;
    }
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
      },
      'somesupersecretsecret',
      { expiresIn: '1h' }
    );
    return { token: token, userId: user._id.toString() };
  },

  createPost: async function ({ postInput }, req) {
    if (!req.isAuth) throwError('Not authenticated!', 401);

    const user = await User.findById(req.userId);
    if (!user) throwError('Not authenticated!', 401);

    if (!validator.isLength(postInput.title, { min: 5 }))
      throwError('Title is to short!', 422);

    if (!validator.isLength(postInput.content, { min: 5 }))
      throwError('Content is to short!', 422);

    const post = new Post({ ...postInput, creator: req.userId });
    const result = await post.save();
    user.posts.push(result);
    await user.save();
    // console.log('id type: ', typeof result._id);
    // return {
    //   ...result._doc,
    //   // _id: result._id.toString(),
    //   creator: { ...user._doc, _id: user._id.toString() },
    // };

    return {
      ...result._doc,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      creator: user._doc,
    };
  },

  getPosts: async function ({ page }, req) {
    if (!req.isAuth) throwError('Not authenticated!', 401);

    const user = await User.findById(req.userId);
    if (!user) throwError('Not authenticated!', 401);
    const ITEMS_PER_PAGE = 2;

    // const page = page || 1;
    const totalItems = await Post.find().countDocuments();
    let posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE)
      .populate('creator');

    posts = posts.map(p => {
      return { ...p._doc, createdAt: p.createdAt.toISOString() };
    });
    return { posts, totalItems };
  },

  getPost: async function ({ postId }, req) {
    if (!req.isAuth) throwError('Not authenticated!', 401);

    const post = await Post.findById(postId).populate('creator');
    if (!post) throwError('Post not found', 404);

    return {
      ...post._doc,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  },

  updatePost: async function ({ postId, postInput }, req) {
    if (!req.isAuth) throwError('Not authenticated!', 401);

    const user = await User.findById(req.userId);
    if (!user) throwError('Not authenticated!', 401);

    if (!validator.isLength(postInput.title, { min: 5 }))
      throwError('Title is to short!', 422);

    if (!validator.isLength(postInput.content, { min: 5 }))
      throwError('Content is to short!', 422);

    const post = await Post.findById(postId);
    if (!post) throwError('Post not found!', 404);

    if (post.creator.toString() !== req.userId)
      throwError('Not authorized!', 403);

    post.title = postInput.title;
    post.content = postInput.content;
    post.imageUrl = postInput.imageUrl;
    const result = await post.save();
    return {
      ...result._doc,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      creator: { ...user._doc },
    };
  },

  deletePost: async function ({ postId }, req) {
    if (!req.isAuth) throwError('Not authenticated!', 401);
    const user = await User.findById(req.userId);
    if (!user) throwError('Not authenticated!', 401);

    const post = await Post.findOneAndDelete({
      _id: postId,
      creator: req.userId,
    });
    if (!post) throwError('Not Authorized!', 403);

    user.posts.pull(postId);
    await user.save();
    fs.unlink(post.imageUrl, err => console.log(err));
    return 'Post deleted!';
  },

  user: async function (args, req) {
    if (!req.isAuth) throwError('Not authenticated!', 401);
    const user = await User.findById(req.userId);
    if (!user) throwError('Not authenticated!', 401);

    return { ...user._doc };
  },

  updateStatus: async function ({ status }, req) {
    if (!req.isAuth) throwError('Not authenticated!', 401);
    const user = await User.findById(req.userId);
    if (!user) throwError('Not authenticated!', 401);

    user.status = status;
    const result = await user.save();
    return { ...result._doc };
  },
};
