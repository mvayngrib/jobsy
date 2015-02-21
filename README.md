# jobsy

Job queue whose workers fetch data from a URL and store the results in a database. Exposes a REST API for adding jobs and checking their status / results.

##Usage

set port (defaults to 50123), maxConcurrency (defaults to 3) in config.json

run:

    node index.js

query:

    // Enqueue

    curl -X POST http://localhost:50123/queue --data url=http%3A%2F%2Fgraph.facebook.com%2Fmvayngrib

```
  // Sample response
  {
    "status": "success",
    "data": {
      "id": "abcde-fghij"
    }
  }
```

    // Check results

    curl http://localhost:50123/get?id=abcde-fghij

```
  // Sample response
  {
    "status": "success",   // query was successful
    "data": {
      "status": "success", // job was successful
      "details": null,     // here live error messages
      "result": {
        "id": "703381",
        "first_name": "Mark",
        "gender": "male",
        "last_name": "Vayngrib",
        "link": "https://www.facebook.com/mvayngrib",
        "locale": "en_US",
        "name": "Mark Vayngrib",
        "username": "mvayngrib"
      }
    }
  }
```
