#!/bin/bash

# Vertex AI Infrastructure Setup Script
# This script sets up all Google Cloud infrastructure for Vertex AI migration
# Run this script after authenticating with: gcloud auth login

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="sengolvertexapi"
REGION="us-central1"
ZONE="us-central1-a"
BUCKET_NAME="sengol-incidents"
SERVICE_ACCOUNT_NAME="sengol-api"
CRAWLER_INSTANCE_NAME="sengol-crawler"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   Vertex AI Infrastructure Setup${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI is not installed"
    echo "Please install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    print_error "Not authenticated with gcloud"
    echo "Please run: gcloud auth login"
    exit 1
fi

print_status "gcloud CLI authenticated"

# Set project
echo ""
print_info "Setting project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID
print_status "Project set to $PROJECT_ID"

# Enable required APIs
echo ""
print_info "Enabling required Google Cloud APIs..."

APIS=(
    "compute.googleapis.com"
    "storage.googleapis.com"
    "aiplatform.googleapis.com"
    "iam.googleapis.com"
    "cloudfunctions.googleapis.com"
)

for api in "${APIS[@]}"; do
    echo "  Enabling $api..."
    gcloud services enable $api --project=$PROJECT_ID 2>&1 | grep -v "already enabled" || true
done

print_status "All required APIs enabled"

# Create Cloud Storage bucket
echo ""
print_info "Creating Cloud Storage bucket: gs://$BUCKET_NAME"

if gsutil ls -b gs://$BUCKET_NAME 2>/dev/null; then
    print_info "Bucket already exists: gs://$BUCKET_NAME"
else
    gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME
    print_status "Bucket created: gs://$BUCKET_NAME"
fi

# Set lifecycle policy for bucket
echo ""
print_info "Setting lifecycle policy for bucket..."

cat > /tmp/lifecycle.json <<'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {
          "age": 365,
          "matchesPrefix": ["incidents/archive/"]
        }
      }
    ]
  }
}
EOF

gsutil lifecycle set /tmp/lifecycle.json gs://$BUCKET_NAME
rm /tmp/lifecycle.json
print_status "Lifecycle policy set"

# Create service account
echo ""
print_info "Creating service account: $SERVICE_ACCOUNT_NAME"

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL --project=$PROJECT_ID 2>/dev/null; then
    print_info "Service account already exists: $SERVICE_ACCOUNT_EMAIL"
else
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="Sengol API Service Account" \
        --project=$PROJECT_ID
    print_status "Service account created: $SERVICE_ACCOUNT_EMAIL"
fi

# Grant permissions to service account
echo ""
print_info "Granting permissions to service account..."

ROLES=(
    "roles/aiplatform.user"
    "roles/storage.objectAdmin"
    "roles/logging.logWriter"
)

for role in "${ROLES[@]}"; do
    echo "  Granting $role..."
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="$role" \
        --condition=None \
        > /dev/null 2>&1
done

print_status "Permissions granted"

# Create and download service account key
echo ""
print_info "Creating service account key..."

KEY_FILE="sengol-api-key.json"
if [ -f "$KEY_FILE" ]; then
    print_info "Service account key already exists: $KEY_FILE"
else
    gcloud iam service-accounts keys create $KEY_FILE \
        --iam-account=$SERVICE_ACCOUNT_EMAIL \
        --project=$PROJECT_ID
    print_status "Service account key created: $KEY_FILE"
fi

# Base64 encode for Vercel
echo ""
print_info "Encoding key for Vercel..."
cat $KEY_FILE | base64 | tr -d '\n' > sengol-api-key-base64.txt
print_status "Base64 encoded key saved to: sengol-api-key-base64.txt"

# Create Compute Engine instance for crawlers
echo ""
print_info "Creating Compute Engine instance: $CRAWLER_INSTANCE_NAME"

if gcloud compute instances describe $CRAWLER_INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID 2>/dev/null; then
    print_info "Crawler instance already exists: $CRAWLER_INSTANCE_NAME"
else
    # Create startup script
    cat > /tmp/startup-script.sh <<'STARTUP_EOF'
#!/bin/bash

# Update system
apt-get update
apt-get upgrade -y

# Install dependencies
apt-get install -y python3 python3-pip python3-venv git curl wget jq

# Create application directory
mkdir -p /opt/sengol-crawler
cd /opt/sengol-crawler

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Create requirements.txt
cat > requirements.txt <<'REQ_EOF'
google-cloud-storage==2.14.0
google-cloud-aiplatform==1.38.0
requests==2.31.0
beautifulsoup4==4.12.2
pandas==2.1.4
schedule==1.2.0
python-dotenv==1.0.0
lxml==4.9.3
REQ_EOF

# Install Python dependencies
pip install -r requirements.txt

echo "Crawler instance setup complete" > /opt/sengol-crawler/setup-complete.txt
STARTUP_EOF

    gcloud compute instances create $CRAWLER_INSTANCE_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --machine-type=e2-micro \
        --image-family=debian-11 \
        --image-project=debian-cloud \
        --boot-disk-size=10GB \
        --boot-disk-type=pd-standard \
        --scopes=cloud-platform \
        --service-account=$SERVICE_ACCOUNT_EMAIL \
        --tags=crawler,http-server \
        --metadata-from-file=startup-script=/tmp/startup-script.sh \
        --metadata=enable-oslogin=TRUE

    rm /tmp/startup-script.sh
    print_status "Crawler instance created: $CRAWLER_INSTANCE_NAME"
    print_info "Instance is initializing (this takes 2-3 minutes)..."
fi

# Create Vertex AI Dataset (for grounding)
echo ""
print_info "Setting up Vertex AI Data Store for grounding..."
print_info "Note: Data store will be populated by crawlers"

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   Setup Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
print_status "Infrastructure setup completed successfully"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo ""
echo "1. Deploy crawler code to instance:"
echo "   ${YELLOW}./scripts/deploy-crawler.sh${NC}"
echo ""
echo "2. Update Vercel environment variables:"
echo "   ${YELLOW}vercel env add GOOGLE_CLOUD_PROJECT production${NC}"
echo "   Enter: $PROJECT_ID"
echo ""
echo "   ${YELLOW}vercel env add VERTEX_AI_LOCATION production${NC}"
echo "   Enter: $REGION"
echo ""
echo "   ${YELLOW}vercel env add GCS_BUCKET_NAME production${NC}"
echo "   Enter: $BUCKET_NAME"
echo ""
echo "   ${YELLOW}vercel env add GOOGLE_APPLICATION_CREDENTIALS_JSON production${NC}"
echo "   Paste contents of: sengol-api-key-base64.txt"
echo ""
echo "3. Deploy to Vercel:"
echo "   ${YELLOW}vercel --prod${NC}"
echo ""
echo -e "${GREEN}Created Resources:${NC}"
echo "  - Bucket: gs://$BUCKET_NAME"
echo "  - Service Account: $SERVICE_ACCOUNT_EMAIL"
echo "  - Crawler Instance: $CRAWLER_INSTANCE_NAME (zone: $ZONE)"
echo "  - Service Account Key: $KEY_FILE"
echo ""
echo -e "${YELLOW}Important Files:${NC}"
echo "  - sengol-api-key.json (keep secure!)"
echo "  - sengol-api-key-base64.txt (for Vercel)"
echo ""
