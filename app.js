const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const e = require('express');
const app = express();
const port = 3000;


// TODO: Update PostgreSQL connection credentials before running the server
// const pool = new Pool({
//   user: 'test',
//   host: 'localhost',
//   database: 'ecommerce',
//   password: 'test',
//   port: 5432,
// });
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ecommerce',
  password: ' ',
  port: 5432,
});

app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Set up session
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
}));


// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});


// Middleware to check if user is logged in
function isLoggedIn(req, res, next) {
  if (req.session.user_id) {
    return res.redirect('/dashboard');  // Redirect to dashboard or home page
  }
  next();  // If not logged in, proceed to the signup/login page
}

// TODO: Implement authentication middleware
// Redirect unauthenticated users to the login page
function isAuthenticated(req, res, next) {
  if (req.session.user_id) {
    return next();
  }
  res.redirect('/login');
}


// Route: Home page
app.get('/', async (req, res) => {
  try {
    res.render('home-page');
  } catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: Signup page
app.get('/signup', isLoggedIn, (req, res) => {
  res.render('signup');
});

// TODO: Implement user signup logic
app.post('/signup', isLoggedIn, async (req, res) => {
  try {
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const hashedPassword = await bcrypt.hash(password, 8)

    const existing_username = await pool.query(`
      SELECT * FROM users 
      WHERE username = $1
    `, [username]);
    const existing_email = await pool.query(`
      SELECT * FROM users 
      WHERE email = $1
    `, [email]);

    var output = {
      retry_username: existing_username.rows.length > 0,
      retry_email: existing_email.rows.length > 0
    }

    if (output.retry_username || output.retry_email) {
      return res.render('signup', output);
    }

    var d = new Date();
    const user_id = d.getTime() % 1000000000;
    await pool.query(`
      INSERT INTO users 
      VALUES ($1, $2, $3, $4)
    `, [user_id, username, email, hashedPassword]);

    req.session.user_id = user_id;
    req.session.save();
    return res.redirect('/dashboard');
  } 
  catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: Login page 
app.get('/login', isLoggedIn, (req, res) => {
  res.render('login');
});

// TODO: Implement user login logic
app.post('/login', async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;
    const result = await pool.query(`
      SELECT * FROM users 
      WHERE email = $1
    `, [email]);

    if (result.rows.length == 0) {
      return res.render('login', { invalid_account: true });
    }

    const user = result.rows[0];
    const is_password_match = await bcrypt.compare(password, user.password_hash);

    if (is_password_match) {
      req.session.user_id = user.user_id;
      req.session.save();
      res.redirect('/dashboard');
    } 
    else {
      res.render('login', { invalid_password: true });
    }
  } catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: Dashboard page (requires authentication)
// TODO: Render the dashboard page
app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    res.render('dashboard');
  } catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: List products
// TODO: Fetch and display all products from the database
app.get('/list-products', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM products 
      ORDER BY product_id
    `);

    res.render('products', { products: result.rows });
  } catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: Add product to cart
// TODO: Implement "Add to Cart" functionality
app.get('/add-to-cart', isAuthenticated, async (req, res) => {
  try {
    res.render('add-to-cart');
  } catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});

app.post('/add-to-cart', isAuthenticated, async (req, res) => {
  // Convert and validate quantity
  const quantity = parseInt(req.body.quantity, 10);
  if (isNaN(quantity) || quantity <= 0) {
    console.error('Invalid quantity');
    return res.render('add-to-cart', { success: false });
  }
  try {
    const user_id = req.session.user_id;
    const product_id = req.body.product_id;

    const products_result = await pool.query(`
      SELECT * 
      FROM products 
      WHERE product_id = $1
    `, [product_id]);

    if (products_result.rows.length == 0) {
      console.error('No product with id = ', product_id, ' found');
      return res.render('add-to-cart', { success: false });
    }
    else if (products_result.rows[0].stock_quantity < quantity) { 
      console.error('Insufficient stock for product with id = ', product_id);
      return res.render('add-to-cart', { success: false, insufficient_stock: true });
    }
    else if (quantity <= 0) {
      console.error('Quantity should be greater than 0');
      return res.render('add-to-cart', { success: false });
    }
    else if (products_result.rows.length > 1) {
      console.error('More than one product found with id = ', product_id);
      return res.render('add-to-cart', { success: false });
    }

    const cart_result = await pool.query(`
      SELECT * 
      FROM cart 
      WHERE user_id = $1 AND item_id = $2
    `, [user_id, product_id]);

    if (cart_result.rows.length == 0) {
      await pool.query(`
        INSERT INTO cart 
        VALUES ($1, $2, $3)
      `, [user_id, product_id, quantity]);
    }
    else if (cart_result.rows.length == 1) {
      var updated_quantity__cart = parseInt(quantity, 10);
      updated_quantity__cart += parseInt(cart_result.rows[0].quantity, 10);
      await pool.query(`
        UPDATE cart 
        SET quantity = $1
        WHERE user_id = $2 AND item_id = $3
      `, [updated_quantity__cart, user_id, product_id]);
    }
    else if (cart_result.rows.length > 1) {
      console.error('More than one cart item found for user_id = ', user_id, ' and product_id = ', product_id);
      return res.render('add-to-cart', { success: false });
    }

    return res.render('add-to-cart', { success: true });
  }
  catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: Remove product from cart
// TODO: Implement "Remove from Cart" functionality
app.get('/remove-from-cart', isAuthenticated, async (req, res) => {
  res.render('remove-from-cart');
});

app.post('/remove-from-cart', isAuthenticated, async (req, res) => {
  try {
    const user_id = req.session.user_id;
    const product_id = req.body.product_id;

    const cart_result = await pool.query(`
      SELECT * 
      FROM cart 
      WHERE user_id = $1 AND item_id = $2
    `, [user_id, product_id]);

    if (cart_result.rows.length == 0) {
      console.error('No product with id = ', product_id, ' found in the cart');
      return res.render('remove-from-cart', { success: false });
    }

    await pool.query(`
      DELETE FROM cart 
      WHERE user_id = '${user_id}' AND item_id = '${product_id}'
    `);
    return res.render('remove-from-cart', { success: true });
  }
  catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: Display cart
// TODO: Retrieve and display the user's cart items
app.get('/display-cart', isAuthenticated, async (req, res) => {
  try {
    const user_id = req.session.user_id;
    const cart_result = await pool.query(`
      SELECT item_id, quantity 
      FROM cart 
      WHERE user_id = $1
      ORDER BY item_id
    `, [user_id]);

    const cart = [];
    var grand_total_price = 0;
    for (let i = 0; i < cart_result.rows.length; i++) {
      const product_id = cart_result.rows[i].item_id;
      const quantity = cart_result.rows[i].quantity;
      const product_result = await pool.query(`
        SELECT * 
        FROM products 
        WHERE product_id = $1
      `, [product_id]);

      var total_price = quantity * product_result.rows[0].price;
      grand_total_price += total_price;

      cart.push({
        product_id: product_id,
        name: product_result.rows[0].name,
        quantity: quantity,
        price: product_result.rows[0].price,
        total_price: total_price,
        stock_status: product_result.rows[0].stock_quantity > quantity ? 'In stock' : 'Out of stock',
      });
    }

    res.render('display-cart', { cart: cart, total_price: grand_total_price });
  }
  catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: Place order (clear cart)
// TODO: Implement order placement logic
app.post('/place-order', isAuthenticated, async (req, res) => {
  try {
    const user_id = req.session.user_id;
    const cart_items_result = await pool.query(`
      SELECT item_id, quantity 
      FROM cart 
      WHERE user_id = $1
    `, [user_id]);

    if (cart_items_result.rows.length === 0) {
      return res.send(`
        <p>Your cart is empty.</p>
        <a href="/display-cart">Go back to cart</a>
      `);
    }

    // Check stock availability and calculate total order amount
    let total_amount = 0;
    for (const item of cart_items_result.rows) {
      const product_result = await pool.query(`
        SELECT * FROM products 
        WHERE product_id = $1
      `, [item.item_id]);

      if (product_result.rows.length === 0) {
        return res.send(`
          <p>Product with id ${item.item_id} not found.</p>
          <a href="/display-cart">Go back to cart</a>
        `);
      }
      
      const product = product_result.rows[0];
      if (product.stock_quantity < item.quantity) {
        return res.send(`
          <p>Insufficient stock for product: ${product.name}.</p>
          <a href="/display-cart">Go back to cart</a>
        `);
      }
      
      total_amount += item.quantity * product.price;
    }

    const order_date = new Date().toISOString();
    const order_id = new Date().getTime() % 1000000000;
    await pool.query(`
      INSERT INTO Orders (order_id, user_id, order_date, total_amount)
      VALUES ($1, $2, $3, $4)
    `, [order_id, user_id, order_date, total_amount]);

    for (const item of cart_items_result.rows) {
      const product_result = await pool.query(`
        SELECT * FROM products 
        WHERE product_id = $1
      `, [item.item_id]);
      
      const product = product_result.rows[0];
      await pool.query(`
        INSERT INTO orderitems (order_id, product_id, quantity, price)
        VALUES ($1, $2, $3, $4)
      `, [order_id, item.item_id, item.quantity, product.price]);

      const updated_stock = product.stock_quantity - item.quantity;
      await pool.query(`
        UPDATE products 
        SET stock_quantity = $1
        WHERE product_id = $2
      `, [updated_stock, item.item_id]);
    }

    // Clear the user's cart
    await pool.query(`
      DELETE FROM cart 
      WHERE user_id = $1
    `, [user_id]);

    res.redirect('/order-confirmation');
  }
  catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }    
});


// Route: Order confirmation
// TODO: Display order confirmation details
app.get('/order-confirmation', isAuthenticated, async (req, res) => {
  try {
    const user_id = req.session.user_id;
    const order_result = await pool.query(`
      SELECT * FROM Orders 
      WHERE user_id = $1
      ORDER BY order_date DESC
      LIMIT 1
    `, [user_id]);

    if (order_result.rows.length === 0) {
      return res.send('No recent order found.');
    }
    
    const order = order_result.rows[0];
    const orderitems_result = await pool.query(`
      SELECT o.product_id, p.name, o.quantity, o.price,
        (o.quantity * o.price) AS total_price
      FROM orderitems o
      JOIN products p ON o.product_id = p.product_id
      WHERE o.order_id = $1
      ORDER BY o.product_id
    `, [order.order_id]);

    res.render('order-confirmation', {
      order_id: order.order_id,
      order_date: order.order_date,
      total_amount: order.total_amount,
      orders: orderitems_result.rows
    });
  }
  catch (error) {
    console.error(error);
    res.send('Server error:\r\n' + error);
  }
});


// Route: Logout (destroy session)
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.send('Error logging out');
    }
    res.redirect('/login');
  });
});