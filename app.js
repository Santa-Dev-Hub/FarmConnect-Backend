const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ============= DATABASE CONNECTION =============
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// ============= MIDDLEWARE =============
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ============= AUTH ROUTES =============

// Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password, role } = req.body;

    if (!name || !phone || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (name, phone, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, role',
      [name, phone, hashedPassword, role]
    );

    const token = jwt.sign(
      { id: result.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'User registered successfully',
      token,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }

    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    const isPasswordValid = await bcryptjs.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= LABOUR MODULE ROUTES =============

// Farmer: Post a Job
app.post('/api/labour/post-job', verifyToken, async (req, res) => {
  try {
    const { job_title, skill_required, workers_needed, wage_per_day, job_date, location_lat, location_lng } = req.body;

    if (!job_title || !skill_required || !workers_needed || !wage_per_day || !job_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO jobs (farmer_id, job_title, skill_required, workers_needed, wage_per_day, job_date, location_lat, location_lng, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open') 
       RETURNING *`,
      [req.userId, job_title, skill_required, workers_needed, wage_per_day, job_date, location_lat || 28.7041, location_lng || 77.1025]
    );

    await matchWorkers(result.rows[0].id, location_lat || 28.7041, location_lng || 77.1025, skill_required);

    res.json({
      success: true,
      message: 'Job posted successfully',
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Post job error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Worker: Post Availability
app.post('/api/labour/post-availability', verifyToken, async (req, res) => {
  try {
    const { skills, availability_date, hourly_rate, location_lat, location_lng } = req.body;

    if (!skills || !availability_date || !hourly_rate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO worker_availability (worker_id, skills, availability_date, location_lat, location_lng, hourly_rate, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'available') 
       RETURNING *`,
      [req.userId, skills, availability_date, location_lat || 28.7041, location_lng || 77.1025, hourly_rate]
    );

    res.json({
      success: true,
      message: 'Availability posted successfully',
      availability: result.rows[0]
    });
  } catch (error) {
    console.error('Post availability error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Job Matches
app.get('/api/labour/matches', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.name, u.phone, u.rating, j.job_title, j.wage_per_day
       FROM matches m 
       JOIN users u ON m.worker_id = u.id 
       JOIN jobs j ON m.job_id = j.id
       WHERE m.status = 'pending' 
       ORDER BY m.match_score DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      matches: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Accept a Job Match
app.post('/api/labour/accept-match/:matchId', verifyToken, async (req, res) => {
  try {
    const { matchId } = req.params;

    const result = await pool.query(
      'UPDATE matches SET status = $1 WHERE id = $2 RETURNING *',
      ['accepted', matchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.json({
      success: true,
      message: 'Match accepted successfully',
      match: result.rows[0]
    });
  } catch (error) {
    console.error('Accept match error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= EQUIPMENT MODULE ROUTES =============

// List Equipment
app.post('/api/equipment/list', verifyToken, async (req, res) => {
  try {
    const { equipment_name, equipment_type, rental_rate_per_day, location_lat, location_lng } = req.body;

    if (!equipment_name || !equipment_type || !rental_rate_per_day) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO equipment (owner_id, equipment_name, equipment_type, rental_rate_per_day, location_lat, location_lng, available) 
       VALUES ($1, $2, $3, $4, $5, $6, true) 
       RETURNING *`,
      [req.userId, equipment_name, equipment_type, rental_rate_per_day, location_lat || 28.7041, location_lng || 77.1025]
    );

    res.json({
      success: true,
      message: 'Equipment listed successfully',
      equipment: result.rows[0]
    });
  } catch (error) {
    console.error('List equipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Find Nearby Equipment
app.get('/api/equipment/nearby', async (req, res) => {
  try {
    const { lat, lng, max_distance = 50 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    const result = await pool.query(
      `SELECT *, 
        SQRT(POW(location_lat - $1, 2) + POW(location_lng - $2, 2)) * 111 as distance_km
       FROM equipment 
       WHERE available = TRUE
       ORDER BY distance_km ASC 
       LIMIT 20`,
      [parseFloat(lat), parseFloat(lng)]
    );

    res.json({
      success: true,
      equipment: result.rows.map(item => ({
        ...item,
        distance_km: parseFloat(item.distance_km).toFixed(2)
      }))
    });
  } catch (error) {
    console.error('Find nearby equipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Book Equipment
app.post('/api/equipment/book', verifyToken, async (req, res) => {
  try {
    const { equipment_id, start_date, end_date } = req.body;

    if (!equipment_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const equipmentResult = await pool.query('SELECT * FROM equipment WHERE id = $1', [equipment_id]);

    if (equipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const equipment = equipmentResult.rows[0];

    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (days <= 0) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    const total_cost = days * equipment.rental_rate_per_day;

    const result = await pool.query(
      `INSERT INTO bookings (renter_id, equipment_id, start_date, end_date, total_cost, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') 
       RETURNING *`,
      [req.userId, equipment_id, start_date, end_date, total_cost]
    );

    res.json({
      success: true,
      message: 'Booking created successfully',
      booking: result.rows[0],
      days,
      total_cost
    });
  } catch (error) {
    console.error('Book equipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= ADS MODULE ROUTES =============

// Create Ad Campaign
app.post('/api/ads/campaign', verifyToken, async (req, res) => {
  try {
    const { campaign_name, ad_content, target_role, budget } = req.body;

    if (!campaign_name || !ad_content || !target_role || !budget) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO ads (company_id, campaign_name, ad_content, target_role, budget, status) 
       VALUES ($1, $2, $3, $4, $5, 'active') 
       RETURNING *`,
      [req.userId, campaign_name, ad_content, target_role, budget]
    );

    res.json({
      success: true,
      message: 'Campaign created successfully',
      campaign: result.rows[0]
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Target Audience
app.get('/api/ads/target-audience', async (req, res) => {
  try {
    const { target_role } = req.query;

    if (!target_role) {
      return res.status(400).json({ error: 'Target role required' });
    }

    const result = await pool.query(
      'SELECT id, name, phone, role FROM users WHERE role = $1 ORDER BY created_at DESC LIMIT 100',
      [target_role]
    );

    res.json({
      success: true,
      audience_count: result.rows.length,
      audience: result.rows
    });
  } catch (error) {
    console.error('Get target audience error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= MATCHING ALGORITHM =============

async function matchWorkers(jobId, job_lat, job_lng, skill_required) {
  try {
    const workersResult = await pool.query(
      `SELECT w.id, w.worker_id, w.location_lat, w.location_lng, w.skills
       FROM worker_availability w
       WHERE w.status = 'available' 
       AND w.skills LIKE $1`,
      [`%${skill_required}%`]
    );

    for (const worker of workersResult.rows) {
      const distance = Math.sqrt(
        Math.pow(job_lat - worker.location_lat, 2) + 
        Math.pow(job_lng - worker.location_lng, 2)
      ) * 111;

      if (distance > 50) continue;

      const proximity_score = Math.max(0, (50 - distance) / 50) * 100;

      const userResult = await pool.query('SELECT rating FROM users WHERE id = $1', [worker.worker_id]);
      const rating = userResult.rows[0]?.rating || 3;

      const rating_score = (rating / 5) * 100;

      const final_score = (proximity_score * 0.8) + (rating_score * 0.2);

      if (final_score > 30) {
        await pool.query(
          `INSERT INTO matches (job_id, worker_id, match_score, distance_km, status) 
           VALUES ($1, $2, $3, $4, 'pending')`,
          [jobId, worker.worker_id, final_score.toFixed(2), distance.toFixed(2)]
        );
      }
    }
  } catch (error) {
    console.error('Matching error:', error);
  }
}

// ============= UTILITY ROUTES =============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ FarmConnect Backend running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${process.env.DATABASE_URL}`);
});
