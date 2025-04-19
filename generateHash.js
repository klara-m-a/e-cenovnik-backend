const bcrypt = require('bcrypt');

const password = 'KdyrIwAOi5rAcDQ8qOZta3E9zRUZtJ'; // Replace with your chosen password
bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
  } else {
    console.log('Your bcrypt hash is:', hash);
  }
});
