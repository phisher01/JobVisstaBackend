const axios = require('axios');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Job Schema including experience as a Number
const jobSchema = new mongoose.Schema({
  title: String,
  company: String,
  location: String,
  experience: Number, // Number of years of experience
  link: String,
});

const Job = mongoose.model('Job', jobSchema);

const API_KEY = process.env.RAPIDAPI_KEY;
const API_URL = 'https://jsearch.p.rapidapi.com/search';

/**
 * fetchJobs:
 * - Combines the search filters into one query string.
 * - Calls RapidAPI.
 * - Maps the response to our job schema.
 * - Clears the DB and inserts the fetched jobs.
 * - Returns the fetched jobs.
 */
const fetchJobs = async (searchQuery = 'all') => {
  console.log(`🟡 Fetching jobs from API for query: "${searchQuery}"...`);
  try {
    const response = await axios.get(API_URL, {
      params: { query: searchQuery, num_pages: 10 },
      headers: {
        'X-RapidAPI-Key': API_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      }
    });
    
    if (!response.data || !response.data.data) {
      console.error('❌ API response missing expected data field');
      return [];
    }
  
    // Map API response to our Job format.
    const jobs = response.data.data.map(job => ({
      title: job.job_title,
      company: job.employer_name,
      location: job.job_city || job.job_state || 'Remote',
      experience: job.job_experience ? Number(job.job_experience) : 0,
      link: job.job_apply_link,
    }));
  
    if (jobs.length === 0) {
      console.log('❌ No jobs found from RapidAPI for the query.');
    } else {
      // Clear existing jobs and insert new ones.
      await Job.deleteMany({});
      await Job.insertMany(jobs);
      console.log(`✅ ${jobs.length} jobs saved to MongoDB`);
    }
    return jobs;
  } catch (err) {
    console.error('❌ Error fetching jobs:', err);
    return [];
  }
};

/**
 * GET /api/search-jobs
 * Expects query parameters: title, location, and/or experience.
 * 1. Combines the filters into a search query string.
 * 2. Calls fetchJobs() which fetches jobs from RapidAPI and saves them to the DB.
 * 3. Returns the fetched jobs directly.
 */
app.get('/api/search-jobs', async (req, res) => { 
  try {
    const { title, location, experience } = req.query;
    if (!title && !location && !experience) {
      return res.status(400).json({ error: "At least one search parameter is required" });
    }

    console.log(`🔍 Search request - title: "${title}", location: "${location}", experience: "${experience}"`);

    // Compose a combined search query string.
    const queryParts = [];
    if (title) queryParts.push(title);
    if (location) queryParts.push(location);
    if (experience) queryParts.push(`${experience} years`);
    const searchQuery = queryParts.join(' ');

    // Fetch jobs from RapidAPI and update DB, then return the fetched jobs.
    const jobs = await fetchJobs(searchQuery);
    console.log(`✅ Returning ${jobs.length} jobs`);
    res.json(jobs);
  } catch (err) {
    console.error('Error in /api/search-jobs:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to get all jobs from DB.
app.get('/api/jobs', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const jobs = await Job.find().skip(skip).limit(limit);
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});


// Get a single job by its MongoDB _id
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (err) {
    console.error('Error fetching job detail:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Optionally, run an initial job fetch on server start.
fetchJobs('all').catch(console.error);

// Start Express Server.
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = { fetchJobs, Job };
