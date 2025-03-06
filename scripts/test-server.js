const http = require('http');
const port = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  console.log('Recebida requisição:', req.url);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end('<html><body><h1>Servidor de teste funcionando!</h1><p>A porta está disponível.</p></body></html>');
});

server.listen(port, () => {
  console.log(`Servidor de teste rodando em http://localhost:${port}`);
}); 