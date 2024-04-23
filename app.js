const path = require('path');
const fs = require('fs');

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const { graphqlHTTP } = require('express-graphql');

const graphqlSchema = require('./graphql/schema');
const graphqlResolver = require('./graphql/resolvers');
const auth = require('./middleware/auth');

const app = express();

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'images');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg'
  ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

// app.use(bodyParser.urlencoded()); // x-www-form-urlencoded <form>
app.use(bodyParser.json()); // application/json
app.use(
  multer({ storage: fileStorage, fileFilter: fileFilter }).single('image')
);
app.use('/images', express.static(path.join(__dirname, 'images')));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'OPTIONS, GET, POST, PUT, PATCH, DELETE'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // the graphql automaticly decline any request except get or post request.
  // the post request have options request before it so the solution is to send empty response of status 200
  if (req.method === 'OPTIONS') return res.sendStatus(200); // return to not continue with next()
  next();
});

app.use(auth);

app.put('/post-image', (req, res, next) => {
  if (!req.isAuth) {
    const err = new Error('Not authenticated');
    error.code = 401;
    throw err;
  }

  // incase updating post without uploading new image
  if (!req.file) return res.status(200).json({ message: 'no image added' });

  // incase updating post with new image
  if (req.body.oldPath) fs.unlink(req.body.oldPath, err => console.log(err));

  // need to change the 2 back slash in the path to 1 forward (may be just for windows OS)
  return res.status(201).json({
    message: 'image is uploaded',
    filePath: req.file.path.replace('\\', '/'),
  });
});

app.use(
  '/graphql',
  graphqlHTTP({
    schema: graphqlSchema,
    rootValue: graphqlResolver,
    graphiql: true,
    // for any thrown error
    customFormatErrorFn(err) {
      // check originalError property which indicades that this error is thorwn by me or by 3rd party lib
      // technical error like wrong syntax doesn't have originalError
      if (!err.originalError) {
        return err;
      }

      // in case my errors that I need to handle
      const data = err.originalError.data;
      const message = err.message || 'An error occurred.';
      const code = err.originalError.code || 500;
      return { message: message, status: code, data: data };
    },
  })
);

app.use((error, req, res, next) => {
  console.log(error);
  const status = error.statusCode || 500;
  const message = error.message;
  const data = error.data;
  res.status(status).json({ message: message, data: data });
});

mongoose
  .connect(
    'mongodb+srv://ahmedtayseer:D60FZKgWHblCvYDM@cluster0.fadgj0l.mongodb.net/feed?retryWrites=true&w=majority&appName=Cluster0'
  )
  .then(result => {
    app.listen(8080);
  })
  .catch(err => console.log(err));
