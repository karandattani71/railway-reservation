# Railway Ticket Reservation API

A RESTful API for managing railway ticket reservations with support for confirmed berths, RAC, and waiting list.

## Features

- Advanced Ticket Booking System

  - Automatic berth allocation with smart seat assignment
  - Support for child passengers under 5 years (no berth allocation)
  - Unique booking reference generation for each ticket
  - Comprehensive passenger details management

- Priority-based Allocation System

  - Preferential lower berth allocation for senior citizens (60+)
  - Special consideration for ladies traveling with children
  - Fair distribution of berth types (Upper, Middle, Lower, Side Upper, Side Lower)

- Dynamic Queue Management

  - Automatic handling of RAC (Reservation Against Cancellation)
  - Waiting list management with automatic queue progression
  - Smart promotion system from Waiting List → RAC → Confirmed
  - Automatic reordering of queue numbers upon cancellations

- Robust Validation & Security

  - Comprehensive input validation for all passenger details
  - Email and contact number format verification
  - Age validation for adult and child passengers
  - UUID-based secure ticket identification

- Real-time Availability Tracking

  - Live tracking of confirmed berths (63 seats)
  - RAC availability monitoring (9 berths, 18 passengers)
  - Waiting list status tracking (max 10 tickets)
  - Category-wise availability checking

- Advanced Transaction Management

  - Concurrent booking handling with database transactions
  - Race condition prevention during ticket operations
  - Atomic operations for booking and cancellation
  - Data consistency maintenance across operations

- Comprehensive API Support

  - RESTful endpoints for all operations
  - Detailed ticket and passenger information retrieval
  - Structured error responses with meaningful messages
  - Support for child passenger bookings

## System Requirements

- Node.js (v18 or higher)
- Docker and Docker Compose
- PostgreSQL (provided via Docker)

## Setup Instructions

1. Clone the repository

```bash
git clone https://github.com/karandattani71/railway-reservation.git
```

2. Navigate to the project directory

```bash
cd railway-ticket-reservation
```

3. Run the following command to start the application:


```bash
docker-compose up --build
```

The API will be available at `http://localhost:3000`

## API Endpoints

### 1. Book a Ticket

Books a new ticket with automatic berth allocation based on availability and priority.

```http
POST /api/v1/tickets/book
```

Request body:

```json
{
  "passenger": {
    "name": "John Doe",
    "age": 35,
    "gender": "MALE",
    "contactNumber": "1234567890",
    "email": "john@example.com",
    "hasChild": false,
    "childPassenger": {
      // Optional, required if hasChild is true
      "name": "Jane Doe",
      "age": 4,
      "gender": "FEMALE"
    }
  }
}
```

Response:

```json
{
  "status": "success",
  "message": "Ticket booked successfully",
  "data": {
    "ticket": {
      "id": "613871aa-85f1-4def-8b59-e2f103682992",
      "status": "CONFIRMED",
      "berthType": "LOWER",
      "berthNumber": 41,
      "waitingListNumber": null,
      "racNumber": null,
      "bookingReference": "TKT1742491430056J0BVC",
      "bookingDate": "2024-03-20T17:23:50.065Z",
      "parentTicketId": null,
      "createdAt": "2024-03-20T17:23:50.066Z",
      "updatedAt": "2024-03-20T17:23:50.066Z",
      "PassengerId": "7454a863-773c-4ac8-8a7b-df795f9db7fa",
      "Passenger": {
        "name": "John Doe",
        "age": 35,
        "gender": "MALE",
        "contactNumber": "1234567890",
        "email": "john@example.com",
        "hasChild": false
      },
      "childTicket": null
    }
  }
}
```

### 2. Cancel a Ticket

Cancels a ticket and automatically promotes RAC/waiting list passengers.

```http
POST /api/v1/tickets/cancel/{ticketId}
```

Response:

```json
{
  "status": "success",
  "message": "Ticket cancelled successfully",
  "data": {
    "ticket": {
      "id": "e26321e5-d458-44dd-b101-fd4cf50e16ce",
      "status": "CANCELLED",
      "berthType": null,
      "berthNumber": null,
      "waitingListNumber": 4,
      "racNumber": null,
      "bookingReference": "TKT1742412366432B5NNS",
      "bookingDate": "2024-03-19T19:26:06.432Z",
      "parentTicketId": null,
      "createdAt": "2024-03-19T19:26:06.432Z",
      "updatedAt": "2024-03-19T19:35:07.883Z",
      "PassengerId": "e6fc6d25-4e3d-4a69-876a-29a88ecc8993",
      "Passenger": {
        "id": "e6fc6d25-4e3d-4a69-876a-29a88ecc8993",
        "name": "John Doe",
        "age": 65,
        "gender": "MALE",
        "hasChild": false,
        "contactNumber": "1234567890",
        "email": "john@example.com",
        "createdAt": "2024-03-19T19:26:06.431Z",
        "updatedAt": "2024-03-19T19:26:06.431Z"
      }
    }
  }
}
```

### 3. View Booked Tickets

Retrieves all booked tickets with detailed passenger information.

```http
GET /api/v1/tickets/booked
```

Response:

```json
{
  "status": "success",
  "data": {
    "tickets": [...],
    "summary": {
      "total": 50,
      "confirmed": 30,
      "rac": 15,
      "waitingList": 5
    },
    "categories": {
      "confirmed": [...],
      "rac": [...],
      "waitingList": [...],
      "childrenNoBerth": [...]
    }
  }
}
```

### 4. Check Available Tickets

Returns current availability across all categories.

```http
GET /api/v1/tickets/available
```

Response:

```json
{
  "status": "success",
  "data": {
    "availability": {
      "confirmed": 13,
      "rac": 3,
      "waitingList": 7
    },
    "summary": {
      "totalBerths": 63,
      "racBerths": 9,
      "maxWaitingList": 10
    }
  }
}
```

## System Constraints

- Total confirmed berths: 63
- RAC berths: 9 (can accommodate 18 passengers)
- Maximum waiting list: 10 tickets
- Priority for lower berths:
  - Senior citizens (age 60+)
  - Ladies with children

## Technical Details

### Architecture

- **Node.js Backend**
  - Express.js for RESTful API implementation
  - Sequelize ORM for database operations
  - PostgreSQL for data persistence
  - Docker containerization for easy deployment

### Implementation Features

#### Booking System

- Smart berth allocation algorithm
  - Priority-based allocation for seniors and ladies with children
  - Lower berth quota management (21 berths reserved)
  - Random allocation for non-priority passengers
- Child passenger handling
  - Special ticket type for children under 5
  - Automatic linking with parent ticket
  - No berth allocation for child tickets

#### Queue Management

- Three-tier booking system
  1. Confirmed tickets (63 berths)
  2. RAC tickets (9 berths, 18 passengers)
  3. Waiting list (10 tickets maximum)
- Automatic promotion system
  - RAC to Confirmed on cancellations
  - Waiting List to RAC on RAC promotions
  - Queue number reordering

#### Data Validation

- Request validation using express-validator
- Comprehensive input sanitization
- Custom validation rules:
  - Age validation (0-120 years, under 5 for children)
  - Contact number format
  - Email format and normalization
  - Gender enumeration
  - Name length constraints

#### Security Measures

- UUID for ticket and passenger identification
- Unique booking references
- Input sanitization and validation
- Transaction-based operations

#### Concurrency Handling

- Database transactions for atomic operations
- Row-level locking for ticket operations
- Race condition prevention:
  - Berth allocation conflicts
  - RAC number conflicts
  - Waiting list number conflicts
- Double booking prevention

#### Error Handling

1. Validation Errors

   - Invalid input data
   - Business rule violations
   - Format violations

2. Business Logic Errors

   - No available tickets
   - Invalid ticket status transitions
   - Duplicate bookings
   - Invalid child passenger registrations

3. Database Errors

   - Transaction failures
   - Constraint violations
   - Connection issues

4. System Errors
   - Server errors
   - External service failures
   - Resource constraints

### Performance Considerations

#### Database Optimization

- Indexed fields:
  - Ticket status
  - Booking reference
  - Passenger relationships
- Efficient query patterns
- Transaction isolation levels

#### Scalability

- Containerized deployment
- Stateless architecture
- Connection pooling
- Resource optimization

### Monitoring and Logging

- Transaction tracking
- Status change logging
- Error tracking
- Performance metrics
- Booking statistics

### API Response Format

All API endpoints follow a consistent response format:

```json
{
  "status": "success" | "error",
  "message": "Operation-specific message",
  "data": {
    // Operation-specific data
  },
  "error": {
    // Error details (if applicable)
    "code": "ERROR_CODE",
    "details": "Detailed error message"
  }
}
```

#### Passenger Table

- id (UUID)
- name (String)
- age (Integer)
- gender (Enum: MALE, FEMALE, OTHER)
- hasChild (Boolean)
- contactNumber (String)
- email (String)

#### Ticket Table

- id (UUID)
- status (Enum: CONFIRMED, RAC, WAITING_LIST, CANCELLED, CHILD_NO_BERTH)
- berthType (Enum: UPPER, MIDDLE, LOWER, SIDE_UPPER, SIDE_LOWER)
- berthNumber (Integer)
- racNumber (Integer)
- waitingListNumber (Integer)
- bookingReference (String)
- bookingDate (DateTime)
- passengerId (UUID, Foreign Key)

### Concurrency Handling

The system uses database transactions to handle concurrent booking requests and ensure data consistency. This prevents:

- Overbooking of berths
- Race conditions during ticket cancellation and promotion
- Inconsistent ticket status updates

### Error Handling

The API includes comprehensive error handling for:

- Validation errors
- Business rule violations
- Database errors
- Server errors
