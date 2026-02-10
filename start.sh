#!/bin/bash

echo "Starting Task Manager..."
echo ""
echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "Starting server on 0.0.0.0:8000..."
echo ""
echo "Access the app at:"
echo "  - Locally: http://localhost:8000"
echo "  - Your IP: http://$(hostname -I | awk '{print $1}'):8000"
echo ""

cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
