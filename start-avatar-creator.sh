#!/bin/bash

echo "🎨 Starting Avatar Creator with Web Server..."
echo "📁 Project folder: $(pwd)"
echo ""

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    echo "✅ Using Python 3..."
    echo "🌐 Opening http://localhost:8000 in your browser..."
    
    # Open browser after a short delay
    (sleep 2 && open http://localhost:8000) &
    
    # Start the server
    python3 -m http.server 8000
    
elif command -v python &> /dev/null; then
    echo "✅ Using Python 2..."
    echo "🌐 Opening http://localhost:8000 in your browser..."
    
    # Open browser after a short delay  
    (sleep 2 && open http://localhost:8000) &
    
    # Start the server
    python -m SimpleHTTPServer 8000
    
else
    echo "❌ Python not found. Please install Python to run the avatar creator."
    echo ""
    echo "Alternative: Open index.html directly (limited functionality)"
    exit 1
fi