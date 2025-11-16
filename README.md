# 🛠 FarmConnect Backend

This is the backend REST API for the FarmConnect application. It is built with Node.js and Express, using PostgreSQL for data storage.

---

## 📋 Table of Contents

- [⚡ Features](#-features)
- [🛠 Technologies](#-technologies)
- [🚀 Setup & Installation](#-setup--installation)
- [🔑 Environment Variables](#-environment-variables)
- [🗄 Database Schema](#-database-schema)
- [⚙️ Scripts](#️-scripts)
- [🛠 Deployment](#-deployment)
- [🐛 Troubleshooting](#-troubleshooting)
- [📜 License](#-license)

---

## ⚡ Features

- User authentication and authorization with JWT
- Secure password hashing with bcrypt
- REST API endpoints for users, jobs, availability, equipment, bookings, matches, and ads
- Role-based access control for farmers, workers, and companies
- Integration with PostgreSQL database

---

## 🛠 Technologies

- Node.js
- Express.js
- PostgreSQL
- JWT for authentication
- bcrypt for password hashing
- dotenv for environment variables
- cors middleware

---

## 🚀 Setup & Installation

1. Clone the repo and navigate to backend folder:
git clone <repo-url>
cd backend

2. Install dependencies:
npm install


3. Create an `.env` file with the following variables:

PORT=5000
DATABASE_URL=postgresql://postgres:<password>@<host>:<port>/<database>
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development
TZ=Asia/Kolkata # To fix timezone issues, optional but recommended

4. Set up the PostgreSQL database schema by running migrations or manually creating tables using the schema file.

5. Start the server:

npm run start


---

## 🔑 Environment Variables

| Variable Name   | Description                               |
|-----------------|-------------------------------------------|
| PORT            | Server listening port (default 5000)   |
| DATABASE_URL    | PostgreSQL connection string            |
| JWT_SECRET      | Secret key for JWT token generation     |
| NODE_ENV        | Environment (development/production)    |
| TZ              | Timezone setting (e.g., Asia/Kolkata)   |

---

## 🗄 Database Schema

- `users`: Stores user details with roles and location.
- `jobs`: Jobs posted by farmers.
- `worker_availability`: Workers' availability details.
- `equipment`: Equipment posted for rental.
- `bookings`: Equipment rental bookings.
- `matches`: Matches between jobs and workers.
- `ads`: Advertisement campaigns.

(for full schema, see project documentation)

---

## ⚙️ Scripts

- `npm run start` - Start server in production mode.
- `npm run dev` - Start server with nodemon for development.

---

## 🛠 Deployment

- Hosted on Railway with environment variables configured for production database.
- Use Railway logs for monitoring and troubleshooting.

---

## 🐛 Troubleshooting

- **"relation users does not exist"**: Ensure database schema is created on production DB.
- **Timezone errors**: Set `TZ=Asia/Kolkata` in environment variables.
- **Invalid credentials**: Check password hashing and user registration.
- Use Railway logs for detailed server errors.

---

## 📜 License

Its free to use ( with credits).

---

Made with ❤️ by Santanu Pal
