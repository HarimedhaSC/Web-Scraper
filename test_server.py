import http.server
import socketserver
import urllib.parse

PORT = 8080

# Global state for our mock product
in_stock = False

class MockProductHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()

    def log_message(self, format, *args):
        import sys
        sys.stdout.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))

    def do_GET(self):
        global in_stock
        
        # Simple HTML template
        status_text = "In Stock" if in_stock else "Out of stock"
        color = "green" if in_stock else "red"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mock Product Page | test-store.com</title>
            <style>
                body {{ font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }}
                .product-card {{ border: 1px solid #ddd; padding: 20px; border-radius: 8px; }}
                .status {{ font-size: 24px; font-weight: bold; color: {color}; margin: 20px 0; }}
                button {{ padding: 10px 20px; font-size: 16px; cursor: pointer; }}
                .admin-panel {{ margin-top: 40px; padding: 20px; background: #f5f5f5; border-radius: 8px; }}
            </style>
        </head>
        <body>
            <div class="product-card">
                <h1>Super Awesome Gadget</h1>
                <p>This is a test product for monitoring.</p>
                <div class="status" id="stock-status">{status_text}</div>
                
                {"<button>Add to Cart</button>" if in_stock else "<button disabled>Sold Out</button>"}
            </div>
            
            <div class="admin-panel">
                <h3>Admin Controls (Test Simulator)</h3>
                <p>Click the button below to change the stock status for testing the extension.</p>
                <form method="POST" action="/toggle">
                    <button type="submit">Toggle Stock Status</button>
                </form>
            </div>
        </body>
        </html>
        """
        
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(html_content.encode("utf-8"))

    def do_POST(self):
        global in_stock
        if self.path == '/toggle':
            in_stock = not in_stock
            
            # Redirect back to the main page
            self.send_response(303)
            self.send_header("Location", "/")
            self.end_headers()
        else:
            self.send_error(404)

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    with ReusableTCPServer(("", PORT), MockProductHandler) as httpd:
        print(f"Test server running at http://localhost:{PORT}")
        print("1. Open the URL in your browser to view the mock product.")
        print("2. Add 'http://localhost:8080/' to your Stock Monitor extension.")
        print("3. Use the 'Toggle Stock Status' button to simulate a change.")
        print("Press Ctrl+C to stop the server.")
        httpd.serve_forever()
