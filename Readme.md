# NextHire Server

NextHire Server is the backend API for the NextHire recruitment platform. It powers company discovery, job search, recruiter job management, applicant workflows, and JWT-based authentication for seekers and recruiters.

## Overview

This project is built with Node.js and Express, and it connects to MongoDB for persistent data storage. The API also validates JWT tokens against a remote JWKS endpoint and supports both public and protected routes depending on user role.

## Features

- Job listing and search APIs with filters, sorting, and pagination
- Job details endpoint with application state checks
- Company listing and company profile APIs
- Recruiter job creation, update, deletion, and listing
- Applicant tracking for recruiter dashboards
- Public and protected authorization middleware
- Role-based access control for seekers, recruiters, and admins
- MongoDB Atlas integration with connection reuse
- Vercel-ready deployment configuration

## Tech Stack

- Node.js
- Express.js
- MongoDB Node.js Driver
- Jose for JWT/JWKS verification
- dotenv for environment configuration
- CORS for cross-origin access

## Project Structure

- `index.js` — main server entry point and all API routes
- `package.json` — project scripts and dependencies
- `vercel.json` — deployment configuration for Vercel
- `.env` — local environment variables (not committed)

## Getting Started

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd nexthire-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory with the following values:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=http://localhost:3000
```

### 4. Run the app locally

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

The server will run on:

```text
http://localhost:5000
```

## Scripts

```bash
npm run dev   # starts the server with nodemon for local development
npm start     # starts the server in production mode
```

## API Highlights

### Public endpoints

- `GET /` — health check / welcome route
- `GET /companies` — list approved companies with pagination and search
- `GET /companies/:companyId` — fetch a specific company
- `POST /jobs/search` — search jobs with filters, sorting, and saved-job checks for seekers
- `GET /jobs/:jobId` — fetch a single job with company information and application status

### Recruiter endpoints

- `GET /recruiter/company/:recruiterId` — get recruiter company details
- `POST /recruiter/jobs` — create a new job listing
- `PATCH /recruiter/jobs/:jobId` — update an existing job
- `DELETE /recruiter/jobs/:jobId` — delete a job
- `GET /recruiter/jobs/:recruiterId` — list recruiter jobs with counts
- `GET /recruiter/job/:jobId` — fetch a single recruiter job
- `GET /recruiter/job-applicants/:jobId` — list applicants for a job

## Authentication

The server uses JWT verification through a remote JWKS endpoint:

- `CLIENT_URL` is used to resolve the JWKS URL
- Protected routes validate the `Authorization: Bearer <token>` header
- Users are checked against role-based middleware for recruiter, seeker, and admin access

## Deployment

This project includes a Vercel configuration for deployment:

- `vercel.json` routes all requests to the Express app
- The app is ready to run as a serverless Node runtime for Vercel

## Notes

- MongoDB connection is initialized on first request, then reused for subsequent requests
- Some job and recruiter flows are designed around the NextHire platform’s business logic and database collections
- Ensure your `.env` values match your MongoDB and frontend auth setup

## License

This project is licensed under the ISC license.
