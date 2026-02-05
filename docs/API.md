# Filadex API Documentation

This document provides comprehensive documentation for the Filadex API endpoints. The API allows you to manage filaments, materials, colors, manufacturers, and other resources in the Filadex application.

## Table of Contents

1. [Authentication](#authentication)
2. [Filaments](#filaments)
3. [Materials](#materials)
4. [Colors](#colors)
5. [Manufacturers](#manufacturers)
6. [Diameters](#diameters)
7. [Storage Locations](#storage-locations)
8. [User Management](#user-management)
9. [Sharing](#sharing)
10. [Statistics](#statistics)
11. [Theme](#theme)
12. [Cloud Backup](#cloud-backup)
13. [Print Jobs](#print-jobs)
14. [Material Compatibility](#material-compatibility)

## Authentication

### Login

Authenticates a user and returns a JWT token as a cookie.

- **URL**: `/api/auth/login`
- **Method**: `POST`
- **Authentication**: None
- **Request Body**:
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "username": "string",
    "isAdmin": "boolean"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Invalid credentials
  - `500 Internal Server Error`: Server error

### Logout

Logs out the current user by clearing the authentication cookie.

- **URL**: `/api/auth/logout`
- **Method**: `POST`
- **Authentication**: Required
- **Response**: `204 No Content`
- **Error Responses**:
  - `500 Internal Server Error`: Server error

### Get Current User

Returns information about the currently authenticated user.

- **URL**: `/api/auth/me`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "username": "string",
    "isAdmin": "boolean",
    "forceChangePassword": "boolean",
    "language": "string",
    "createdAt": "string",
    "lastLogin": "string"
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: User not found
  - `500 Internal Server Error`: Server error

### Change Password

Changes the password for the currently authenticated user.

- **URL**: `/api/auth/change-password`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "currentPassword": "string",
    "newPassword": "string"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Password changed successfully"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Incorrect current password
  - `500 Internal Server Error`: Server error

## Filaments

### Get All Filaments

Returns all filaments for the authenticated user.

- **URL**: `/api/filaments`
- **Method**: `GET`
- **Authentication**: Required
- **Query Parameters**:
  - `export`: (optional) If set to 'csv' or 'json', returns the filaments in the specified format
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "userId": "number",
      "name": "string",
      "manufacturer": "string",
      "material": "string",
      "colorName": "string",
      "colorCode": "string",
      "diameter": "string",
      "printTemp": "string",
      "totalWeight": "string",
      "remainingPercentage": "string",
      "purchaseDate": "string",
      "purchasePrice": "string",
      "status": "string",
      "spoolType": "string",
      "dryerCount": "number",
      "lastDryingDate": "string",
      "storageLocation": "string",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to fetch filaments

### Get Filament by ID

Returns a specific filament by ID.

- **URL**: `/api/filaments/:id`
- **Method**: `GET`
- **Authentication**: Required
- **URL Parameters**:
  - `id`: The ID of the filament
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "userId": "number",
    "name": "string",
    "manufacturer": "string",
    "material": "string",
    "colorName": "string",
    "colorCode": "string",
    "diameter": "string",
    "printTemp": "string",
    "totalWeight": "string",
    "remainingPercentage": "string",
    "purchaseDate": "string",
    "purchasePrice": "string",
    "status": "string",
    "spoolType": "string",
    "dryerCount": "number",
    "lastDryingDate": "string",
    "storageLocation": "string",
    "createdAt": "string",
    "updatedAt": "string"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid filament ID
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: Filament not found
  - `500 Internal Server Error`: Failed to fetch filament

### Create Filament

Creates a new filament.

- **URL**: `/api/filaments`
- **Method**: `POST`
- **Authentication**: Required
- **Query Parameters**:
  - `import`: (optional) If set to 'csv' or 'json', imports filaments from the provided data
- **Request Body** (for single filament):
  ```json
  {
    "name": "string",
    "manufacturer": "string",
    "material": "string",
    "colorName": "string",
    "colorCode": "string",
    "diameter": "string",
    "printTemp": "string",
    "totalWeight": "number",
    "remainingPercentage": "number",
    "purchaseDate": "string",
    "purchasePrice": "number",
    "status": "string",
    "spoolType": "string",
    "dryerCount": "number",
    "lastDryingDate": "string",
    "storageLocation": "string"
  }
  ```
- **Request Body** (for CSV import):
  ```json
  {
    "csvData": "string"
  }
  ```
- **Request Body** (for JSON import):
  ```json
  {
    "jsonData": "string"
  }
  ```
- **Response** (for single filament): `201 Created`
  ```json
  {
    "id": "number",
    "userId": "number",
    "name": "string",
    "manufacturer": "string",
    "material": "string",
    "colorName": "string",
    "colorCode": "string",
    "diameter": "string",
    "printTemp": "string",
    "totalWeight": "string",
    "remainingPercentage": "string",
    "purchaseDate": "string",
    "purchasePrice": "string",
    "status": "string",
    "spoolType": "string",
    "dryerCount": "number",
    "lastDryingDate": "string",
    "storageLocation": "string",
    "createdAt": "string",
    "updatedAt": "string"
  }
  ```
- **Response** (for import): `201 Created`
  ```json
  {
    "created": "number",
    "duplicates": "number",
    "errors": "number"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to create filament

### Update Filament

Updates an existing filament.

- **URL**: `/api/filaments/:id`
- **Method**: `PUT`
- **Authentication**: Required
- **URL Parameters**:
  - `id`: The ID of the filament
- **Request Body**:
  ```json
  {
    "name": "string",
    "manufacturer": "string",
    "material": "string",
    "colorName": "string",
    "colorCode": "string",
    "diameter": "string",
    "printTemp": "string",
    "totalWeight": "number",
    "remainingPercentage": "number",
    "purchaseDate": "string",
    "purchasePrice": "number",
    "status": "string",
    "spoolType": "string",
    "dryerCount": "number",
    "lastDryingDate": "string",
    "storageLocation": "string"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "userId": "number",
    "name": "string",
    "manufacturer": "string",
    "material": "string",
    "colorName": "string",
    "colorCode": "string",
    "diameter": "string",
    "printTemp": "string",
    "totalWeight": "string",
    "remainingPercentage": "string",
    "purchaseDate": "string",
    "purchasePrice": "string",
    "status": "string",
    "spoolType": "string",
    "dryerCount": "number",
    "lastDryingDate": "string",
    "storageLocation": "string",
    "createdAt": "string",
    "updatedAt": "string"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid filament ID or validation error
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: Filament not found
  - `500 Internal Server Error`: Failed to update filament

### Delete Filament

Deletes a filament.

- **URL**: `/api/filaments/:id`
- **Method**: `DELETE`
- **Authentication**: Required
- **URL Parameters**:
  - `id`: The ID of the filament
- **Response**: `204 No Content`
- **Error Responses**:
  - `400 Bad Request`: Invalid filament ID
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: Filament not found
  - `500 Internal Server Error`: Failed to delete filament

### Batch Delete Filaments

Deletes multiple filaments at once.

- **URL**: `/api/filaments/batch`
- **Method**: `DELETE`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "ids": [1, 2, 3]
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Successfully deleted 3 filaments",
    "deletedCount": 3
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid request format
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to delete filaments

### Batch Update Filaments

Updates multiple filaments at once with the same values.

- **URL**: `/api/filaments/batch`
- **Method**: `PATCH`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "ids": [1, 2, 3],
    "updates": {
      "material": "PLA",
      "status": "opened",
      "remainingPercentage": 75
    }
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Successfully updated 3 filaments",
    "updatedCount": 3
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid request format
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to update filaments

## Materials

### Get All Materials

Returns all materials.

- **URL**: `/api/materials`
- **Method**: `GET`
- **Authentication**: Required
- **Query Parameters**:
  - `export`: (optional) If set to 'csv', returns the materials in CSV format
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "name": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to fetch materials

### Create Material

Creates a new material.

- **URL**: `/api/materials`
- **Method**: `POST`
- **Authentication**: Required
- **Query Parameters**:
  - `import`: (optional) If set to 'csv', imports materials from the provided CSV data
- **Request Body** (for single material):
  ```json
  {
    "name": "string"
  }
  ```
- **Request Body** (for CSV import):
  ```json
  {
    "csvData": "string"
  }
  ```
- **Response** (for single material): `201 Created`
  ```json
  {
    "id": "number",
    "name": "string"
  }
  ```
- **Response** (for import): `201 Created`
  ```json
  {
    "created": "number",
    "duplicates": "number",
    "errors": "number"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to create material

### Delete Material

Deletes a material.

- **URL**: `/api/materials/:id`
- **Method**: `DELETE`
- **Authentication**: Required
- **URL Parameters**:
  - `id`: The ID of the material
- **Response**: `204 No Content`
- **Error Responses**:
  - `400 Bad Request`: Invalid material ID
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: Material not found
  - `500 Internal Server Error`: Failed to delete material

## Colors

### Get All Colors

Returns all colors.

- **URL**: `/api/colors`
- **Method**: `GET`
- **Authentication**: Required
- **Query Parameters**:
  - `export`: (optional) If set to 'csv', returns the colors in CSV format
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "name": "string",
      "code": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to fetch colors

### Create Color

Creates a new color.

- **URL**: `/api/colors`
- **Method**: `POST`
- **Authentication**: Required
- **Query Parameters**:
  - `import`: (optional) If set to 'csv', imports colors from the provided CSV data
- **Request Body** (for single color):
  ```json
  {
    "name": "string",
    "code": "string"
  }
  ```
- **Request Body** (for CSV import):
  ```json
  {
    "csvData": "string"
  }
  ```
- **Response** (for single color): `201 Created`
  ```json
  {
    "id": "number",
    "name": "string",
    "code": "string"
  }
  ```
- **Response** (for import): `201 Created`
  ```json
  {
    "created": "number",
    "duplicates": "number",
    "errors": "number"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to create color

### Delete Color

Deletes a color.

- **URL**: `/api/colors/:id`
- **Method**: `DELETE`
- **Authentication**: Required
- **URL Parameters**:
  - `id`: The ID of the color
- **Response**: `204 No Content`
- **Error Responses**:
  - `400 Bad Request`: Invalid color ID
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: Color not found
  - `500 Internal Server Error`: Failed to delete color

## Manufacturers

### Get All Manufacturers

Returns all manufacturers.

- **URL**: `/api/manufacturers`
- **Method**: `GET`
- **Authentication**: Required
- **Query Parameters**:
  - `export`: (optional) If set to 'csv', returns the manufacturers in CSV format
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "name": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to fetch manufacturers

### Create Manufacturer

Creates a new manufacturer.

- **URL**: `/api/manufacturers`
- **Method**: `POST`
- **Authentication**: Required
- **Query Parameters**:
  - `import`: (optional) If set to 'csv', imports manufacturers from the provided CSV data
- **Request Body** (for single manufacturer):
  ```json
  {
    "name": "string"
  }
  ```
- **Request Body** (for CSV import):
  ```json
  {
    "csvData": "string"
  }
  ```
- **Response** (for single manufacturer): `201 Created`
  ```json
  {
    "id": "number",
    "name": "string"
  }
  ```
- **Response** (for import): `201 Created`
  ```json
  {
    "created": "number",
    "duplicates": "number",
    "errors": "number"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to create manufacturer

### Delete Manufacturer

Deletes a manufacturer.

- **URL**: `/api/manufacturers/:id`
- **Method**: `DELETE`
- **Authentication**: Required
- **URL Parameters**:
  - `id`: The ID of the manufacturer
- **Response**: `204 No Content`
- **Error Responses**:
  - `400 Bad Request`: Invalid manufacturer ID
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: Manufacturer not found
  - `500 Internal Server Error`: Failed to delete manufacturer

## Diameters

### Get All Diameters

Returns all diameters.

- **URL**: `/api/diameters`
- **Method**: `GET`
- **Authentication**: Required
- **Query Parameters**:
  - `export`: (optional) If set to 'csv', returns the diameters in CSV format
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "value": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to fetch diameters

### Create Diameter

Creates a new diameter.

- **URL**: `/api/diameters`
- **Method**: `POST`
- **Authentication**: Required
- **Query Parameters**:
  - `import`: (optional) If set to 'csv', imports diameters from the provided CSV data
- **Request Body** (for single diameter):
  ```json
  {
    "value": "string"
  }
  ```
- **Request Body** (for CSV import):
  ```json
  {
    "csvData": "string"
  }
  ```
- **Response** (for single diameter): `201 Created`
  ```json
  {
    "id": "number",
    "value": "string"
  }
  ```
- **Response** (for import): `201 Created`
  ```json
  {
    "created": "number",
    "duplicates": "number",
    "errors": "number"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to create diameter

### Delete Diameter

Deletes a diameter.

- **URL**: `/api/diameters/:id`
- **Method**: `DELETE`
- **Authentication**: Required
- **URL Parameters**:
  - `id`: The ID of the diameter
- **Response**: `204 No Content`
- **Error Responses**:
  - `400 Bad Request`: Invalid diameter ID
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: Diameter not found
  - `500 Internal Server Error`: Failed to delete diameter

## Storage Locations

### Get All Storage Locations

Returns all storage locations.

- **URL**: `/api/storage-locations`
- **Method**: `GET`
- **Authentication**: Required
- **Query Parameters**:
  - `export`: (optional) If set to 'csv', returns the storage locations in CSV format
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "name": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to fetch storage locations

### Create Storage Location

Creates a new storage location.

- **URL**: `/api/storage-locations`
- **Method**: `POST`
- **Authentication**: Required
- **Query Parameters**:
  - `import`: (optional) If set to 'csv', imports storage locations from the provided CSV data
- **Request Body** (for single storage location):
  ```json
  {
    "name": "string"
  }
  ```
- **Request Body** (for CSV import):
  ```json
  {
    "csvData": "string"
  }
  ```
- **Response** (for single storage location): `201 Created`
  ```json
  {
    "id": "number",
    "name": "string"
  }
  ```
- **Response** (for import): `201 Created`
  ```json
  {
    "created": "number",
    "duplicates": "number",
    "errors": "number"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to create storage location

### Delete Storage Location

Deletes a storage location.

- **URL**: `/api/storage-locations/:id`
- **Method**: `DELETE`
- **Authentication**: Required
- **URL Parameters**:
  - `id`: The ID of the storage location
- **Response**: `204 No Content`
- **Error Responses**:
  - `400 Bad Request`: Invalid storage location ID
  - `401 Unauthorized`: Not authenticated
  - `404 Not Found`: Storage location not found
  - `500 Internal Server Error`: Failed to delete storage location

## User Management

### Get All Users

Returns all users (admin only).

- **URL**: `/api/users`
- **Method**: `GET`
- **Authentication**: Required (Admin)
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "username": "string",
      "isAdmin": "boolean",
      "forceChangePassword": "boolean",
      "language": "string",
      "createdAt": "string",
      "lastLogin": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `403 Forbidden`: Not an admin
  - `500 Internal Server Error`: Server error

### Create User

Creates a new user (admin only).

- **URL**: `/api/users`
- **Method**: `POST`
- **Authentication**: Required (Admin)
- **Request Body**:
  ```json
  {
    "username": "string",
    "password": "string",
    "isAdmin": "boolean"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "id": "number",
    "username": "string",
    "isAdmin": "boolean",
    "forceChangePassword": "boolean",
    "language": "string",
    "createdAt": "string"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `403 Forbidden`: Not an admin
  - `409 Conflict`: Username already exists
  - `500 Internal Server Error`: Server error

### Update User

Updates an existing user (admin only).

- **URL**: `/api/users/:id`
- **Method**: `PUT`
- **Authentication**: Required (Admin)
- **URL Parameters**:
  - `id`: The ID of the user
- **Request Body**:
  ```json
  {
    "username": "string",
    "isAdmin": "boolean",
    "forceChangePassword": "boolean",
    "language": "string"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "id": "number",
    "username": "string",
    "isAdmin": "boolean",
    "forceChangePassword": "boolean",
    "language": "string",
    "createdAt": "string",
    "lastLogin": "string"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `403 Forbidden`: Not an admin
  - `404 Not Found`: User not found
  - `409 Conflict`: Username already exists
  - `500 Internal Server Error`: Server error

### Reset User Password

Resets a user's password (admin only).

- **URL**: `/api/users/:id/reset-password`
- **Method**: `POST`
- **Authentication**: Required (Admin)
- **URL Parameters**:
  - `id`: The ID of the user
- **Request Body**:
  ```json
  {
    "password": "string"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Password reset successfully"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `403 Forbidden`: Not an admin
  - `404 Not Found`: User not found
  - `500 Internal Server Error`: Server error

### Delete User

Deletes a user (admin only).

- **URL**: `/api/users/:id`
- **Method**: `DELETE`
- **Authentication**: Required (Admin)
- **URL Parameters**:
  - `id`: The ID of the user
- **Response**: `204 No Content`
- **Error Responses**:
  - `400 Bad Request`: Invalid user ID
  - `401 Unauthorized`: Not authenticated
  - `403 Forbidden`: Not an admin
  - `404 Not Found`: User not found
  - `500 Internal Server Error`: Server error

## Sharing

### Get User Sharing Settings

Returns the sharing settings for the authenticated user.

- **URL**: `/api/user-sharing`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "userId": "number",
      "isPublic": "boolean",
      "materialId": "number",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Server error

### Update User Sharing Settings

Updates the sharing settings for the authenticated user.

- **URL**: `/api/sharing`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "shareAll": "boolean",
    "materials": [
      {
        "id": "number",
        "isPublic": "boolean"
      }
    ]
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "Sharing preferences updated"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Server error

### Get Sharing Settings

Returns the sharing settings for the authenticated user.

- **URL**: `/api/sharing`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  [
    {
      "id": "number",
      "userId": "number",
      "isPublic": "boolean",
      "materialId": "number",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Server error

### Get Public Filaments

Returns the public filaments for a specific user.

- **URL**: `/api/public/filaments/:userId`
- **Method**: `GET`
- **Authentication**: None
- **URL Parameters**:
  - `userId`: The ID of the user
- **Response**: `200 OK`
  ```json
  {
    "user": {
      "id": "number",
      "username": "string"
    },
    "filaments": [
      {
        "id": "number",
        "userId": "number",
        "name": "string",
        "manufacturer": "string",
        "material": "string",
        "colorName": "string",
        "colorCode": "string",
        "diameter": "string",
        "printTemp": "string",
        "totalWeight": "string",
        "remainingPercentage": "string",
        "purchaseDate": "string",
        "purchasePrice": "string",
        "status": "string",
        "spoolType": "string",
        "dryerCount": "number",
        "lastDryingDate": "string",
        "storageLocation": "string",
        "createdAt": "string",
        "updatedAt": "string"
      }
    ]
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid user ID
  - `404 Not Found`: User not found or no shared filaments
  - `500 Internal Server Error`: Server error

## Statistics

### Get Statistics

Returns statistics for the authenticated user's filaments.

- **URL**: `/api/statistics`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  {
    "totalSpools": "number",
    "totalWeight": "string",
    "remainingWeight": "string",
    "averageRemaining": "number",
    "lowStockCount": "number",
    "materialDistribution": [
      {
        "material": "string",
        "count": "number",
        "percentage": "number"
      }
    ],
    "topMaterials": [
      {
        "material": "string",
        "count": "number"
      }
    ],
    "topColors": [
      {
        "color": "string",
        "count": "number"
      }
    ],
    "estimatedValue": "number",
    "totalPurchaseValue": "number",
    "averageAge": "number",
    "oldestFilament": {
      "name": "string",
      "age": "number"
    },
    "newestFilament": {
      "name": "string",
      "age": "number"
    }
  }
  ```
- **Error Responses**:
  - `401 Unauthorized`: Not authenticated
  - `500 Internal Server Error`: Failed to calculate statistics

## Theme

### Get Theme

Returns the current theme settings.

- **URL**: `/api/theme`
- **Method**: `GET`
- **Authentication**: None
- **Response**: `200 OK`
  ```json
  {
    "variant": "string",
    "primary": "string",
    "appearance": "string",
    "radius": "number"
  }
  ```
- **Error Responses**:
  - `404 Not Found`: Theme file not found
  - `500 Internal Server Error`: Failed to read theme

### Update Theme

Updates the theme settings.

- **URL**: `/api/theme`
- **Method**: `POST`
- **Authentication**: None
- **Request Body**:
  ```json
  {
    "variant": "string",
    "primary": "string",
    "appearance": "string",
    "radius": "number"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "variant": "string",
    "primary": "string",
    "appearance": "string",
    "radius": "number"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validation error
  - `500 Internal Server Error`: Failed to update theme

## Cloud Backup

### Download Local Backup

Downloads a JSON backup of the current user's data.

- **URL**: `/api/cloud-backup/download`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK` (application/json file download)
- **Response Body**:
  ```json
  {
    "version": "1.4",
    "backupType": "user",
    "exportedAt": "2026-02-04T12:00:00.000Z",
    "userSettings": {
      "language": "en",
      "currency": "USD",
      "temperatureUnit": "C"
    },
    "data": {
      "filaments": [],
      "printJobs": [],
      "slicerProfiles": [],
      "filamentHistory": [],
      "uploadSessions": [],
      "pendingUploads": [],
      "userSharing": [],
      "backupHistory": [],
      "manufacturers": [],
      "materials": [],
      "colors": [],
      "diameters": [],
      "storageLocations": [],
      "materialCompatibility": []
    }
  }
  ```

### Restore Local Backup

Restores data from a previously downloaded backup file.

- **URL**: `/api/cloud-backup/restore`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**: The backup JSON object
- **Response**: `200 OK`
  ```json
  {
    "message": "Restore completed",
    "restored": {
      "filaments": 10,
      "printJobs": 5,
      "slicerProfiles": 2,
      "filamentHistory": 15,
      "userSharing": 1,
      "uploadSessions": 2,
      "pendingUploads": 8,
      "materialCompatibility": 8,
      "userSettings": true
    }
  }
  ```

### Configure S3-Compatible Storage

Saves S3 configuration for cloud backups.

- **URL**: `/api/cloud-backup/s3/configure`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "endpoint": "https://s3.amazonaws.com",
    "bucket": "my-backup-bucket",
    "region": "us-east-1",
    "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "folderPath": "filadex-backups"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "S3 configuration saved",
    "testResult": "success"
  }
  ```

### Backup to S3

Triggers a backup to configured S3-compatible storage.

- **URL**: `/api/cloud-backup/s3/backup`
- **Method**: `POST`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  {
    "message": "Backup completed successfully",
    "filename": "filadex-backup-2026-02-04T12-00-00.json"
  }
  ```

### Configure WebDAV Storage

Saves WebDAV configuration for cloud backups.

- **URL**: `/api/cloud-backup/webdav/configure`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "url": "https://nextcloud.example.com/remote.php/dav/files/user/",
    "username": "myuser",
    "password": "app-password",
    "folderPath": "Filadex-Backups"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "message": "WebDAV configuration saved",
    "testResult": "success"
  }
  ```

### Backup to WebDAV

Triggers a backup to configured WebDAV storage.

- **URL**: `/api/cloud-backup/webdav/backup`
- **Method**: `POST`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  {
    "message": "Backup completed successfully",
    "filename": "filadex-backup-2026-02-04T12-00-00.json"
  }
  ```

### Admin Full Backup Download

Downloads a complete backup of all users' data (admin only).

- **URL**: `/api/cloud-backup/admin/download`
- **Method**: `GET`
- **Authentication**: Required (Admin)
- **Response**: `200 OK` (application/json file download)
- **Response Body**:
  ```json
  {
    "version": "1.4",
    "backupType": "admin_full",
    "exportedAt": "2026-02-04T12:00:00.000Z",
    "data": {
      "users": [],
      "filaments": [],
      "printJobs": [],
      "slicerProfiles": [],
      "filamentHistory": [],
      "uploadSessions": [],
      "pendingUploads": [],
      "userSharing": [],
      "backupHistory": [],
      "manufacturers": [],
      "materials": [],
      "colors": [],
      "diameters": [],
      "storageLocations": [],
      "materialCompatibility": []
    }
  }
  ```

### Admin Full Backup Restore

Restores a complete system backup including all users (admin only).

- **URL**: `/api/cloud-backup/admin/restore`
- **Method**: `POST`
- **Authentication**: Required (Admin)
- **Request Body**: The admin backup JSON object
- **Response**: `200 OK`
  ```json
  {
    "message": "Admin restore completed",
    "restored": {
      "users": 3,
      "filaments": 50,
      "printJobs": 25,
      "slicerProfiles": 10,
      "filamentHistory": 100,
      "userSharing": 5,
      "uploadSessions": 6,
      "pendingUploads": 20,
      "materialCompatibility": 20
    },
    "note": "3 new users created with temporary password \"changeme\""
  }
  ```
- **Note**: New users are created with password "changeme" and `forceChangePassword: true`

### Get Backup Status

Returns the status of all configured backup providers.

- **URL**: `/api/cloud-backup/status-extended`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  {
    "google": { "configured": false, "enabled": false, "lastBackup": null },
    "dropbox": { "configured": false, "enabled": false, "lastBackup": null },
    "onedrive": { "configured": false, "enabled": false, "lastBackup": null },
    "s3": { "configured": true, "enabled": true, "lastBackup": "2026-02-04T12:00:00.000Z" },
    "webdav": { "configured": true, "enabled": false, "lastBackup": null }
  }
  ```

### Get Backup History

Returns the backup/restore history for the current user.

- **URL**: `/api/cloud-backup/history`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  [
    {
      "id": 1,
      "provider": "s3",
      "status": "completed",
      "fileSize": 12345,
      "startedAt": "2026-02-04T12:00:00.000Z",
      "completedAt": "2026-02-04T12:00:05.000Z"
    }
  ]
  ```

## Print Jobs

### Get All Print Jobs

Returns all print jobs for the authenticated user.

- **URL**: `/api/print-jobs`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  [
    {
      "id": 1,
      "userId": 1,
      "name": "Benchy",
      "filamentId": 5,
      "status": "completed",
      "filamentUsed": "15.5",
      "printDuration": 3600,
      "notes": "First print with new PLA",
      "createdAt": "2026-02-04T12:00:00.000Z"
    }
  ]
  ```

### Create Print Job

Creates a new print job record.

- **URL**: `/api/print-jobs`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "name": "Benchy",
    "filamentId": 5,
    "status": "completed",
    "filamentUsed": 15.5,
    "printDuration": 3600,
    "notes": "First print with new PLA"
  }
  ```
- **Response**: `201 Created`

## Material Compatibility

### Get All Compatibility Entries

Returns all material compatibility entries.

- **URL**: `/api/material-compatibility`
- **Method**: `GET`
- **Authentication**: Required
- **Response**: `200 OK`
  ```json
  [
    {
      "id": 1,
      "material1": "PLA",
      "material2": "PETG",
      "compatibility": "poor",
      "interfaceStrength": "weak",
      "notes": "Materials do not bond well",
      "createdAt": "2026-02-04T12:00:00.000Z"
    }
  ]
  ```

### Create Compatibility Entry

Creates a new material compatibility entry.

- **URL**: `/api/material-compatibility`
- **Method**: `POST`
- **Authentication**: Required
- **Request Body**:
  ```json
  {
    "material1": "PLA",
    "material2": "PLA+",
    "compatibility": "excellent",
    "interfaceStrength": "strong",
    "notes": "Very similar materials, bond well"
  }
  ```
- **Response**: `201 Created`

### Delete Compatibility Entry

Deletes a material compatibility entry.

- **URL**: `/api/material-compatibility/:id`
- **Method**: `DELETE`
- **Authentication**: Required
- **Response**: `204 No Content`

## Error Responses

All API endpoints may return the following error responses:

### 400 Bad Request

Returned when the request is malformed or contains invalid data.

```json
{
  "message": "string"
}
```

### 401 Unauthorized

Returned when authentication is required but not provided or is invalid.

```json
{
  "message": "Not authenticated"
}
```

### 403 Forbidden

Returned when the authenticated user does not have permission to access the resource.

```json
{
  "message": "Access denied"
}
```

### 404 Not Found

Returned when the requested resource does not exist.

```json
{
  "message": "string"
}
```

### 409 Conflict

Returned when the request conflicts with the current state of the server.

```json
{
  "message": "string"
}
```

### 500 Internal Server Error

Returned when an unexpected error occurs on the server.

```json
{
  "message": "string"
}
```

## Authentication

Most endpoints require authentication. To authenticate, include the JWT token in a cookie named `token`. The token is obtained by calling the `/api/auth/login` endpoint.

### Admin-Only Endpoints

Some endpoints are only accessible to users with admin privileges. These endpoints will return a `403 Forbidden` response if accessed by a non-admin user.

## Query Parameters

### Export Parameter

Many GET endpoints support an `export` query parameter that allows you to export the data in CSV or JSON format. For example:

```
GET /api/filaments?export=csv
```

### Import Parameter

Many POST endpoints support an `import` query parameter that allows you to import data from CSV or JSON. For example:

```
POST /api/filaments?import=csv
```

## Data Formats

### CSV Format

When exporting data as CSV, the first line contains the column headers, and each subsequent line contains the data for one record. Fields are separated by commas, and text fields that contain commas are enclosed in double quotes.

When importing data from CSV, the file should follow the same format. The first line may contain column headers, which will be used to map the data to the appropriate fields. If the first line does not contain headers, the data will be mapped based on the order of the columns.

### JSON Format

When exporting data as JSON, the response is a JSON array containing objects representing each record.

When importing data from JSON, the request body should contain a `jsonData` field with a JSON string representing an array of objects.

## Pagination

Currently, the API does not support pagination. All endpoints return all matching records.

## Rate Limiting

Currently, the API does not implement rate limiting.

## Versioning

The API does not currently use versioning in the URL path. Future versions may introduce versioning to maintain backward compatibility.
