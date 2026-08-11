const http = require('http');
const express = require('express');
const assessmentModule = require('../server/routes/assessment');

const app = express();
app.use(express.json());
app.use('/api/v1/assessments', assessmentModule.router);
app.post('/api/v1/hr/toggle-assessment', assessmentModule.handleToggleAssessment);

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`Test SSE server listening on port ${port}`);

  // 1. Connect SSE client
  const req = http.get(`http://localhost:${port}/api/v1/assessments/stream-availability?tenant_id=ten-test`, (res) => {
    console.log(`SSE Response status: ${res.statusCode}`);
    console.log(`Content-Type: ${res.headers['content-type']}`);

    let dataReceived = '';

    res.on('data', (chunk) => {
      const text = chunk.toString();
      console.log(`Received SSE Chunk: ${text.trim()}`);
      dataReceived += text;

      if (text.includes('connected') || text.includes('availability_update')) {
        console.log("✓ SUCCESS: SSE Stream connection established & initial payload received!");
        res.destroy();
        server.close(() => {
          console.log("Server closed successfully.");
          process.exit(0);
        });
      }
    });
  });

  req.on('error', (err) => {
    console.error("SSE Connection error:", err);
    server.close();
    process.exit(1);
  });
});
