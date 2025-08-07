#!/bin/bash

# Lead Scoring OSINT Test Runner
# This script helps you quickly test the system

set -e

echo "🚀 Lead Scoring OSINT Test Runner"
echo "================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if service is running
check_service() {
    local url=$1
    local name=$2
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|301\|302"; then
        echo -e "${GREEN}✓${NC} $name is running"
        return 0
    else
        echo -e "${RED}✗${NC} $name is not running"
        return 1
    fi
}

# Function to run Docker setup
setup_docker() {
    echo -e "\n${YELLOW}Setting up with Docker...${NC}"
    
    # Copy env files if they don't exist
    if [ ! -f backend/.env ]; then
        cp backend/.env.example backend/.env
        echo "Created backend/.env from example"
    fi
    
    if [ ! -f frontend/.env ]; then
        cp frontend/.env.example frontend/.env
        echo "Created frontend/.env from example"
    fi
    
    # Start Docker services
    echo -e "\n${YELLOW}Starting Docker services...${NC}"
    docker-compose up -d --build
    
    # Wait for services to start
    echo -e "\n${YELLOW}Waiting for services to start...${NC}"
    sleep 10
    
    # Run migrations
    echo -e "\n${YELLOW}Running database migrations...${NC}"
    docker-compose exec -T backend npm run migrate
}

# Function to create test data
create_test_data() {
    echo -e "\n${YELLOW}Creating test data files...${NC}"
    
    # Create test CSV
    cat > test_leads.csv << EOF
Domain,Company Name,Contact Email,Industry
google.com,Google Inc,contact@google.com,Technology
microsoft.com,Microsoft Corporation,info@microsoft.com,Software
apple.com,Apple Inc,contact@apple.com,Technology
amazon.com,Amazon,info@amazon.com,E-commerce
facebook.com,Meta,contact@facebook.com,Social Media
netflix.com,Netflix,info@netflix.com,Entertainment
tesla.com,Tesla Inc,contact@tesla.com,Automotive
spotify.com,Spotify,info@spotify.com,Music Streaming
airbnb.com,Airbnb,contact@airbnb.com,Travel
uber.com,Uber Technologies,info@uber.com,Transportation
EOF
    
    echo -e "${GREEN}✓${NC} Created test_leads.csv"
}

# Function to run quick test
run_quick_test() {
    echo -e "\n${YELLOW}Running quick system test...${NC}"
    
    # Check if Python is installed
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Python 3 is required for testing${NC}"
        exit 1
    fi
    
    # Create and run test script
    python3 << 'EOF'
import requests
import time
import json

BASE_URL = "http://localhost:3010/api"

print("\n1. Testing API health...")
try:
    resp = requests.get(f"{BASE_URL}/health")
    if resp.status_code == 200:
        print("✅ API is healthy")
    else:
        print(f"❌ API health check failed: {resp.status_code}")
except Exception as e:
    print(f"❌ Cannot connect to API: {e}")
    exit(1)

print("\n2. Creating test account...")
signup_data = {
    "email": f"test_{int(time.time())}@example.com",
    "password": "Test123!",
    "company": "Test Company"
}

signup_resp = requests.post(f"{BASE_URL}/auth/signup", json=signup_data)
if signup_resp.status_code == 201:
    print("✅ Account created")
    token = signup_resp.json()['token']
else:
    print(f"❌ Signup failed: {signup_resp.text}")
    exit(1)

print("\n3. Testing file upload...")
headers = {"Authorization": f"Bearer {token}"}

# Read test CSV
with open('test_leads.csv', 'r') as f:
    csv_content = f.read()

files = {'file': ('test_leads.csv', csv_content, 'text/csv')}
upload_resp = requests.post(f"{BASE_URL}/upload", headers=headers, files=files)

if upload_resp.status_code == 200:
    job_id = upload_resp.json()['jobId']
    print(f"✅ File uploaded, Job ID: {job_id}")
else:
    print(f"❌ Upload failed: {upload_resp.text}")
    exit(1)

print("\n4. Monitoring job progress...")
for i in range(30):
    job_resp = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=headers)
    if job_resp.status_code == 200:
        job = job_resp.json()
        status = job.get('status')
        progress = job.get('progress', 0)
        print(f"   Status: {status} | Progress: {progress}%", end='\r')
        
        if status == 'completed':
            print(f"\n✅ Job completed successfully!")
            break
        elif status == 'failed':
            print(f"\n❌ Job failed: {job.get('error')}")
            exit(1)
    
    time.sleep(2)

print("\n✨ Quick test completed successfully!")
print(f"\n📌 You can now:")
print(f"   - View the dashboard at http://localhost:3011")
print(f"   - Login with: {signup_data['email']} / {signup_data['password']}")
print(f"   - Download results for job: {job_id}")
EOF
}

# Main menu
show_menu() {
    echo "Choose an option:"
    echo "1) Full Docker setup and test"
    echo "2) Quick test (assumes services are running)"
    echo "3) Check service status"
    echo "4) Create test data files only"
    echo "5) Stop all services"
    echo "6) View logs"
    echo "7) Exit"
}

# Main script
while true; do
    echo ""
    show_menu
    read -p "Enter your choice: " choice
    
    case $choice in
        1)
            setup_docker
            check_service "http://localhost:3010/api/health" "Backend API"
            check_service "http://localhost:3011" "Frontend"
            create_test_data
            run_quick_test
            ;;
        2)
            check_service "http://localhost:3010/api/health" "Backend API"
            check_service "http://localhost:3011" "Frontend"
            create_test_data
            run_quick_test
            ;;
        3)
            echo -e "\n${YELLOW}Checking services...${NC}"
            check_service "http://localhost:3010/api/health" "Backend API"
            check_service "http://localhost:3011" "Frontend"
            check_service "http://localhost:6379" "Redis"
            ;;
        4)
            create_test_data
            ;;
        5)
            echo -e "\n${YELLOW}Stopping all services...${NC}"
            docker-compose down
            echo -e "${GREEN}✓${NC} Services stopped"
            ;;
        6)
            echo -e "\n${YELLOW}Select log to view:${NC}"
            echo "1) All logs"
            echo "2) Backend logs"
            echo "3) Frontend logs"
            echo "4) Worker logs"
            echo "5) Redis logs"
            read -p "Enter choice: " log_choice
            
            case $log_choice in
                1) docker-compose logs --tail=50 -f ;;
                2) docker-compose logs --tail=50 -f backend ;;
                3) docker-compose logs --tail=50 -f frontend ;;
                4) docker-compose logs --tail=50 -f worker ;;
                5) docker-compose logs --tail=50 -f redis ;;
                *) echo "Invalid choice" ;;
            esac
            ;;
        7)
            echo "Goodbye!"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            ;;
    esac
done