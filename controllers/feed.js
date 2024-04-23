const fs = require('fs');

const { validationResult } = require('express-validator');

const io = require('../socket.js');
const Post = require('../models/post.js');

const deleteFile = filePath => {
  // this call back is executed after the operation success or fail
  fs.unlink(filePath, err => {
    if (err) {
      throw err;
    }
  });
};

exports.getPosts = (req, res, next) => {
  const currentPage = req.query.page || 1;
  const perPage = 2;
  let totalItems;
  Post.find()
    .countDocuments()
    .then(count => {
      totalItems = count;
      return Post.find()
        .sort({ createdAt: -1 }) // sort posts desc according to date
        .skip((currentPage - 1) * perPage) // skip last pages
        .limit(perPage); // get just items per page
    })
    .then(posts => {
      res.status(200).json({
        message: 'Fetched posts successfully.',
        posts: posts,
        totalItems: totalItems,
      });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.createPost = (req, res, next) => {
  const title = req.body.title;
  const content = req.body.content;
  const image = req.file;
  // Validation for files in controller

  if (!image) {
    const err = new Error('image is required');
    err.statusCode = 422;
    throw err;
  }
  const errors = validationResult(req); // get the errors if exists

  if (!errors.isEmpty()) {
    const error = new Error('Invalid Input');
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
    // const messages = errors.array().map(e => e.msg);
    // res.status(422).json({ errors: messages });
  }

  // need to change the 2 back slash in the path to 1 forward (may be just for windows OS)
  const imageUrl = image.path.replace('\\', '/');

  // Create post in db
  const post = new Post({
    title,
    content,
    imageUrl,
    creator: { userId: req.user._id, name: req.user.name },
  });
  post
    .save()
    .then(post => {
      req.user.posts.push(post._id);
      req.user.save().then(result => {
        // before sending the response
        // emit: tell send to all clients on the 'post' chanal these data {} when post is created
        io.getIO().emit('posts', { action: 'create', post: post });
        res.status(201).json({
          message: 'Post created successfully!',
          post,
        });
      });
    })
    .catch(err => {
      next(err);
    });
};

exports.getPost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findOne({ _id: postId })
    .then(post => {
      if (!post) {
        const err = new Error('No such post');
        err.statusCode = 404;
        throw err;
      }
      res.status(200).json({ message: 'fetched successfully!', post });
    })
    .catch(err => {
      next(err);
    });
};
exports.updatePost = (req, res, next) => {
  const postId = req.params.postId;
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect.');
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }
  const title = req.body.title;
  const content = req.body.content;
  // if (!req.file) {
  //   const error = new Error('No file picked.');
  //   error.statusCode = 422;
  //   throw error;
  // }
  let imageUrl = null;
  if (req.file) imageUrl = req.file.path.replace('\\', '/');

  // Post.findById(postId)
  Post.findOne({ _id: postId, 'creator.userId': req.user._id })
    .then(post => {
      if (!post) {
        const error = new Error('Could not find post.');
        error.statusCode = 404;
        throw error;
      }

      if (imageUrl) deleteFile(post.imageUrl);
      else imageUrl = post.imageUrl;

      post.title = title;
      post.imageUrl = imageUrl;
      post.content = content;
      return post.save();
    })
    .then(post => {
      io.getIO().emit('posts', { action: 'update', post: post });
      res.status(200).json({ message: 'Post updated!', post: post });
    })
    .catch(err => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.deletePost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findOneAndDelete({ _id: postId, 'creator.userId': req.user._id })
    .then(post => {
      if (!post) {
        const err = new Error('not authorized');
        err.statusCode = 401;
        throw err;
      }

      deleteFile(post.imageUrl);

      const posts = req.user.posts.filter(
        p => p.toString() !== post._id.toString()
      );
      req.user.posts = posts;
      req.user.save().then(result => {
        io.getIO().emit('posts', { action: 'delete', post: postId });
        res.json({ message: 'post deleted!' });
      });
    })
    .catch(err => next(err));
};
