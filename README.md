# Railway Ticket Reservation API

A RESTful API for managing railway ticket reservations with support for confirmed berths, RAC, and waiting list.

## Features

- Book tickets with automatic berth allocation
- Cancel tickets with automatic promotion of RAC and waiting list passengers
- View booked tickets with passenger details
- Check available tickets in different categories
- Priority allocation for senior citizens and ladies with children
- Concurrency handling using database transactions
- Input validation and error handling

## System Requirements

- Node.js (v14 or higher)
- Docker and Docker Compose
- PostgreSQL (provided via Docker)

## Setup Instructions

1. Clone the repository
2. Navigate to the project directory
3. Run the following command to start the application:

```bash
docker-compose up --build
```

The API will be available at `http://localhost:3000`

## API Endpoints

### 1. Book a Ticket

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
    "hasChild": false
  }
}
```

### 2. Cancel a Ticket

```http
POST /api/v1/tickets/cancel/{ticketId}
```

### 3. View Booked Tickets

```http
GET /api/v1/tickets/booked
```

### 4. Check Available Tickets

```http
GET /api/v1/tickets/available
```

## System Constraints

- Total confirmed berths: 63
- RAC berths: 9 (can accommodate 18 passengers)
- Maximum waiting list: 10 tickets
- Priority for lower berths:
  - Senior citizens (age 60+)
  - Ladies with children

## Technical Details

### Database Schema

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
- status (Enum: CONFIRMED, RAC, WAITING_LIST, CANCELLED)
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

## Testing

To run the test suite:

```bash
npm test
```

## License

MIT
