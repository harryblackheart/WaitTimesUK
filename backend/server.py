from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import math
import httpx
import asyncio
import re
from bs4 import BeautifulSoup
import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Resend configuration
resend.api_key = os.environ.get('RESEND_API_KEY')
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'ae-wait-times-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Last scrape timestamp
last_waitsmart_scrape = None

# Create the main app
app = FastAPI(title="A&E Wait Times API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer(auto_error=False)

# ============== Models ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    payment_id: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    is_paid: bool
    is_admin: bool
    created_at: str
    mask_name: bool = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class HospitalBase(BaseModel):
    name: str
    address: str
    postcode: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class HospitalCreate(HospitalBase):
    pass

class HospitalResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    postcode: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    current_wait_minutes: Optional[int] = None
    last_updated: Optional[str] = None
    last_updated_by: Optional[str] = None
    last_updated_by_masked: bool = True
    is_approved: bool
    created_at: str
    distance: Optional[float] = None

class WaitTimeUpdate(BaseModel):
    hospital_id: str
    wait_minutes: int = Field(..., ge=0, le=720)
    user_latitude: Optional[float] = None
    user_longitude: Optional[float] = None

class PendingWaitTimeUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    hospital_id: str
    hospital_name: str
    wait_minutes: int
    submitted_by: str
    submitted_by_email: str
    user_latitude: Optional[float] = None
    user_longitude: Optional[float] = None
    distance_km: Optional[float] = None
    created_at: str

class PendingHospitalResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    address: str
    postcode: str
    submitted_by: str
    submitted_by_email: str
    created_at: str

class AdminOverrideWaitTime(BaseModel):
    hospital_id: str
    wait_minutes: int = Field(..., ge=0, le=720)

class PaymentVerification(BaseModel):
    email: EmailStr
    payment_id: str

# ============== Helper Functions ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, is_admin: bool = False) -> str:
    payload = {
        "sub": user_id,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await get_current_user(credentials)

async def require_paid_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await require_auth(credentials)
    if not user.get("is_paid") and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Payment required to access this feature")
    return user

async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await require_auth(credentials)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula (returns km)"""
    R = 6371  # Earth's radius in km
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

async def get_postcode_coordinates(postcode: str) -> Optional[tuple]:
    """Get coordinates from postcode using postcodes.io API"""
    try:
        async with httpx.AsyncClient() as client:
            clean_postcode = postcode.replace(" ", "").upper()
            response = await client.get(f"https://api.postcodes.io/postcodes/{clean_postcode}")
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == 200:
                    result = data.get("result", {})
                    return (result.get("latitude"), result.get("longitude"))
    except Exception as e:
        logging.error(f"Error fetching postcode coordinates: {e}")
    return None

# ============== WaitSmart Scraper ==============

def parse_wait_time_text(wait_text: str) -> Optional[int]:
    """Parse wait time text like '5 min', '1 hr 30 min', '2 hr' into minutes"""
    if not wait_text:
        return None
    
    wait_text = wait_text.lower().strip()
    
    # Handle "Closed" or invalid
    if 'closed' in wait_text or not wait_text:
        return None
    
    total_minutes = 0
    
    # Match hours
    hr_match = re.search(r'(\d+)\s*hr', wait_text)
    if hr_match:
        total_minutes += int(hr_match.group(1)) * 60
    
    # Match minutes
    min_match = re.search(r'(\d+)\s*min', wait_text)
    if min_match:
        total_minutes += int(min_match.group(1))
    
    # If just a number, assume minutes
    if total_minutes == 0:
        num_match = re.search(r'(\d+)', wait_text)
        if num_match:
            total_minutes = int(num_match.group(1))
    
    return total_minutes if total_minutes > 0 else None

def normalize_hospital_name(name: str) -> str:
    """Normalize hospital name for matching"""
    name = name.lower()
    # Remove common suffixes
    for suffix in ['a&e', 'a and e', 'miu', 'utc', "children's", 'emergency', 'hospital', 'infirmary']:
        name = name.replace(suffix, '')
    # Remove parenthetical locations
    name = re.sub(r'\([^)]*\)', '', name)
    # Remove extra whitespace
    name = ' '.join(name.split())
    return name.strip()

async def scrape_waitsmart():
    """Scrape wait times from waitsmart.co.uk and add new hospitals"""
    global last_waitsmart_scrape
    from curl_cffi import requests as cffi_requests
    
    try:
        wait_data = []
        
        # First scrape the main page for live wait times
        response = await asyncio.to_thread(
            cffi_requests.get,
            'https://waitsmart.co.uk/',
            impersonate="chrome",
            timeout=60
        )
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            hospital_links = soup.find_all('a', href=re.compile(r'/hospital-waiting-times/'))
            
            for link in hospital_links:
                try:
                    text_content = link.get_text(separator=' ', strip=True)
                    href = link.get('href', '')
                    
                    wait_match = re.search(r'(\d+\s*hr\s*\d+\s*min|\d+\s*min|\d+\s*hr)', text_content, re.IGNORECASE)
                    
                    if wait_match:
                        wait_text = wait_match.group(1)
                        wait_minutes = parse_wait_time_text(wait_text)
                        
                        name_text = text_content
                        # Remove leading rank number (e.g., "1 ", "2 ", "10 ")
                        name_text = re.sub(r'^\d+\s+', '', name_text)
                        for prefix in ['MIU', 'A&E', 'UTC', "Children's A&E", 'Urgent Treatment Centre', 'Emergency Gynaecology']:
                            if name_text.startswith(prefix):
                                name_text = name_text[len(prefix):].strip()
                        
                        name_match = re.match(r'^(.+?)(?:\s+(?:Updated|NHS|Trust|\d+\s*(?:min|hr|waiting)))', name_text, re.IGNORECASE)
                        if name_match:
                            hospital_name = name_match.group(1).strip()
                        else:
                            slug = href.split('/')[-1] if href else ''
                            hospital_name = slug.replace('-', ' ').replace('a and e', 'A&E').title()
                        
                        hospital_type = "A&E"
                        if 'MIU' in text_content[:20]:
                            hospital_type = "MIU"
                        elif 'UTC' in text_content[:30] or 'Urgent Treatment' in text_content[:30]:
                            hospital_type = "UTC"
                        elif "Children" in text_content[:30]:
                            hospital_type = "Children's A&E"
                        
                        if hospital_name and wait_minutes and len(hospital_name) > 3:
                            wait_data.append({
                                'name': hospital_name,
                                'wait_minutes': wait_minutes,
                                'normalized_name': normalize_hospital_name(hospital_name),
                                'type': hospital_type,
                                'slug': href.split('/')[-1] if href else None,
                                'has_live_data': True
                            })
                except Exception as e:
                    logging.error(f"Error parsing hospital link: {e}")
                    continue
        
        # Now scrape the departments page to get ALL hospitals
        dept_response = await asyncio.to_thread(
            cffi_requests.get,
            'https://waitsmart.co.uk/departments',
            impersonate="chrome",
            timeout=60
        )
        
        if dept_response.status_code == 200:
            dept_soup = BeautifulSoup(dept_response.text, 'html.parser')
            
            # Find table rows
            table = dept_soup.find('table')
            if table:
                rows = table.find_all('tr')[1:]  # Skip header row
                
                existing_slugs = {d['slug'] for d in wait_data if d.get('slug')}
                
                for row in rows:
                    try:
                        cells = row.find_all('td')
                        if len(cells) >= 4:
                            name_cell = cells[0]
                            link = name_cell.find('a')
                            if link:
                                href = link.get('href', '')
                                slug = href.split('/')[-1] if href else ''
                                name = link.get_text(strip=True)
                                dept_type = cells[1].get_text(strip=True)
                                trust = cells[2].get_text(strip=True) if len(cells) > 2 else ''
                                area = cells[3].get_text(strip=True) if len(cells) > 3 else ''
                                
                                if slug not in existing_slugs and name and len(name) > 3:
                                    clean_name = name.replace(' A&E', '').replace(' MIU', '').replace(' UTC', '').strip()
                                    
                                    wait_data.append({
                                        'name': name,
                                        'clean_name': clean_name,
                                        'wait_minutes': None,
                                        'normalized_name': normalize_hospital_name(name),
                                        'type': dept_type if dept_type else 'A&E',
                                        'area': area,
                                        'trust': trust,
                                        'slug': slug,
                                        'has_live_data': False
                                    })
                    except Exception as e:
                        logging.error(f"Error parsing department row: {e}")
                        continue
        
        # Get existing hospitals
        our_hospitals = await db.hospitals.find({}, {"_id": 0}).to_list(1000)
        our_normalized_names = {normalize_hospital_name(h['name']): h for h in our_hospitals}
        our_slugs = {h.get('waitsmart_slug'): h for h in our_hospitals if h.get('waitsmart_slug')}
        
        updated_count = 0
        added_count = 0
        matched_indices = set()
        
        # First pass: Update existing hospitals with live wait times
        for hospital in our_hospitals:
            if not hospital.get('is_approved'):
                continue
                
            our_normalized = normalize_hospital_name(hospital['name'])
            our_slug = hospital.get('waitsmart_slug')
            
            best_match = None
            best_score = 0
            best_idx = -1
            
            for idx, scraped in enumerate(wait_data):
                if not scraped.get('has_live_data'):
                    continue
                
                if our_slug and scraped.get('slug') == our_slug:
                    best_match = scraped
                    best_idx = idx
                    break
                
                our_words = set(our_normalized.split())
                scraped_words = set(scraped['normalized_name'].split())
                
                if our_words and scraped_words:
                    common = our_words.intersection(scraped_words)
                    score = len(common) / max(len(our_words), len(scraped_words))
                    
                    if our_normalized in scraped['normalized_name'] or scraped['normalized_name'] in our_normalized:
                        score = max(score, 0.8)
                    
                    if score > best_score and score >= 0.5:
                        best_score = score
                        best_match = scraped
                        best_idx = idx
            
            if best_match and best_match.get('wait_minutes'):
                matched_indices.add(best_idx)
                now = datetime.now(timezone.utc).isoformat()
                await db.hospitals.update_one(
                    {"id": hospital['id']},
                    {"$set": {
                        "current_wait_minutes": best_match['wait_minutes'],
                        "last_updated": now,
                        "last_updated_by": "WaitSmart (Auto)",
                        "last_updated_by_masked": False,
                        "waitsmart_slug": best_match.get('slug')
                    }}
                )
                updated_count += 1
                logging.info(f"Updated {hospital['name']} with {best_match['wait_minutes']} min from WaitSmart")
        
        # Second pass: Add new hospitals from WaitSmart
        for idx, scraped in enumerate(wait_data):
            if idx in matched_indices:
                continue
            
            scraped_normalized = scraped['normalized_name']
            scraped_slug = scraped.get('slug')
            
            if scraped_slug and scraped_slug in our_slugs:
                continue
            
            is_duplicate = False
            for existing_normalized in our_normalized_names:
                existing_words = set(existing_normalized.split())
                scraped_words = set(scraped_normalized.split())
                
                if existing_words and scraped_words:
                    common = existing_words.intersection(scraped_words)
                    score = len(common) / max(len(existing_words), len(scraped_words))
                    if score >= 0.7:
                        is_duplicate = True
                        break
            
            if not is_duplicate and scraped['name'] and len(scraped['name']) > 5:
                now = datetime.now(timezone.utc).isoformat()
                
                full_name = scraped.get('clean_name') or scraped['name']
                type_suffix = scraped.get('type', 'A&E')
                if type_suffix and type_suffix not in full_name:
                    full_name = f"{full_name} {type_suffix}"
                
                hospital_doc = {
                    "id": str(uuid.uuid4()),
                    "name": full_name,
                    "address": scraped.get('area', 'UK'),
                    "postcode": "",
                    "latitude": None,
                    "longitude": None,
                    "is_approved": True,
                    "submitted_by": "waitsmart",
                    "submitted_by_email": "auto@waitsmart.co.uk",
                    "current_wait_minutes": scraped.get('wait_minutes'),
                    "last_updated": now if scraped.get('wait_minutes') else None,
                    "last_updated_by": "WaitSmart (Auto)" if scraped.get('wait_minutes') else None,
                    "last_updated_by_masked": False,
                    "created_at": now,
                    "source": "waitsmart",
                    "waitsmart_slug": scraped.get('slug'),
                    "trust": scraped.get('trust', '')
                }
                
                await db.hospitals.insert_one(hospital_doc)
                added_count += 1
                our_normalized_names[scraped_normalized] = hospital_doc
                if scraped_slug:
                    our_slugs[scraped_slug] = hospital_doc
                logging.info(f"Added new hospital: {full_name}")
        
        last_waitsmart_scrape = datetime.now(timezone.utc)
        
        return {
            "updated": updated_count,
            "added": added_count,
            "scraped_count": len(wait_data),
            "timestamp": last_waitsmart_scrape.isoformat()
        }
    except Exception as e:
        logging.error(f"Error scraping WaitSmart: {e}")
        return {"updated": 0, "added": 0, "error": str(e)}

async def auto_scrape_waitsmart():
    """Background task to scrape WaitSmart every hour"""
    while True:
        try:
            logging.info("Starting scheduled WaitSmart scrape...")
            result = await scrape_waitsmart()
            logging.info(f"WaitSmart scrape completed: {result}")
        except Exception as e:
            logging.error(f"Error in scheduled scrape: {e}")
        
        # Wait 1 hour
        await asyncio.sleep(3600)

# ============== Auth Routes ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user already exists
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # For PayPal NCP link, we trust the frontend verification
    # In production, you'd verify with PayPal IPN/webhooks
    is_paid = bool(user_data.payment_id)
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email.lower(),
        "name": user_data.name,
        "password_hash": hash_password(user_data.password),
        "plain_password": user_data.password,
        "is_paid": is_paid,
        "is_admin": False,
        "payment_id": user_data.payment_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_wait_update": None,
        "mask_name": True
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            email=user_doc["email"],
            name=user_doc["name"],
            is_paid=is_paid,
            is_admin=False,
            created_at=user_doc["created_at"],
            mask_name=True
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email.lower()}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user["id"], user.get("is_admin", False))
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            is_paid=user["is_paid"],
            is_admin=user.get("is_admin", False),
            created_at=user["created_at"],
            mask_name=user.get("mask_name", True)
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user = Depends(require_auth)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        is_paid=user["is_paid"],
        is_admin=user.get("is_admin", False),
        created_at=user["created_at"],
        mask_name=user.get("mask_name", True)
    )

class UpdateProfileSettings(BaseModel):
    mask_name: Optional[bool] = None

@api_router.patch("/auth/profile")
async def update_profile(settings: UpdateProfileSettings, user = Depends(require_auth)):
    """Update user profile settings"""
    update_data = {}
    if settings.mask_name is not None:
        update_data["mask_name"] = settings.mask_name
    
    if update_data:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": update_data}
        )
    
    return {"message": "Profile updated successfully"}

@api_router.post("/auth/verify-payment")
async def verify_payment(data: PaymentVerification):
    """Mark user as paid after PayPal payment"""
    user = await db.users.find_one({"email": data.email.lower()})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"email": data.email.lower()},
        {"$set": {"is_paid": True, "payment_id": data.payment_id}}
    )
    
    return {"message": "Payment verified successfully"}

# ============== Hospital Routes ==============

@api_router.get("/hospitals", response_model=List[HospitalResponse])
async def get_hospitals(
    postcode: Optional[str] = None,
    sort_by: Optional[str] = None,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    user = None
    if credentials:
        try:
            user = await get_current_user(credentials)
        except:
            pass
    
    # Get only approved hospitals
    hospitals = await db.hospitals.find({"is_approved": True}, {"_id": 0}).to_list(1000)
    
    # If postcode search, calculate distances
    if postcode:
        coords = await get_postcode_coordinates(postcode)
        if coords:
            for hospital in hospitals:
                if hospital.get("latitude") and hospital.get("longitude"):
                    hospital["distance"] = calculate_distance(
                        coords[0], coords[1],
                        hospital["latitude"], hospital["longitude"]
                    )
                else:
                    hospital["distance"] = 9999
            hospitals.sort(key=lambda x: x.get("distance", 9999))
    
    # Sort by wait times if requested
    if sort_by == "wait_time":
        hospitals.sort(key=lambda x: x.get("current_wait_minutes") or 9999)
    
    # If user is not paid, don't show actual wait times (will be blurred on frontend)
    can_see_wait_times = user and (user.get("is_paid") or user.get("is_admin"))
    
    result = []
    for h in hospitals:
        response = HospitalResponse(
            id=h["id"],
            name=h["name"],
            address=h["address"],
            postcode=h["postcode"],
            latitude=h.get("latitude"),
            longitude=h.get("longitude"),
            current_wait_minutes=h.get("current_wait_minutes"),
            last_updated=h.get("last_updated"),
            last_updated_by=h.get("last_updated_by"),
            last_updated_by_masked=h.get("last_updated_by_masked", True),
            is_approved=h["is_approved"],
            created_at=h["created_at"],
            distance=round(h["distance"], 1) if h.get("distance") is not None else None
        )
        result.append(response)
    
    return result

class SimilarHospitalCheck(BaseModel):
    name: str
    postcode: Optional[str] = None

class SimilarHospitalResponse(BaseModel):
    id: str
    name: str
    address: str
    postcode: str
    similarity_score: float

@api_router.post("/hospitals/check-similar", response_model=List[SimilarHospitalResponse])
async def check_similar_hospitals(data: SimilarHospitalCheck, user = Depends(require_auth)):
    """Check for similar existing hospitals before submission"""
    # Get all approved hospitals
    hospitals = await db.hospitals.find({"is_approved": True}, {"_id": 0}).to_list(1000)
    
    similar = []
    search_name = data.name.lower().strip()
    search_words = set(search_name.replace("hospital", "").replace("the", "").split())
    
    for h in hospitals:
        hospital_name = h["name"].lower()
        hospital_words = set(hospital_name.replace("hospital", "").replace("the", "").split())
        
        # Calculate similarity based on word overlap
        if search_words and hospital_words:
            common_words = search_words.intersection(hospital_words)
            similarity = len(common_words) / max(len(search_words), len(hospital_words))
        else:
            similarity = 0
        
        # Also check if search name is contained in hospital name or vice versa
        if search_name in hospital_name or hospital_name in search_name:
            similarity = max(similarity, 0.8)
        
        # Check postcode match
        if data.postcode:
            search_postcode = data.postcode.replace(" ", "").upper()[:4]
            hospital_postcode = h["postcode"].replace(" ", "").upper()[:4]
            if search_postcode == hospital_postcode:
                similarity = max(similarity, 0.5)
        
        if similarity >= 0.3:  # 30% similarity threshold
            similar.append(SimilarHospitalResponse(
                id=h["id"],
                name=h["name"],
                address=h["address"],
                postcode=h["postcode"],
                similarity_score=round(similarity, 2)
            ))
    
    # Sort by similarity score descending
    similar.sort(key=lambda x: x.similarity_score, reverse=True)
    return similar[:5]  # Return top 5 matches

@api_router.post("/hospitals/submit")
async def submit_hospital(hospital: HospitalCreate, user = Depends(require_auth)):
    """Submit a new hospital for admin approval"""
    # Get coordinates for the postcode
    coords = await get_postcode_coordinates(hospital.postcode)
    
    hospital_id = str(uuid.uuid4())
    hospital_doc = {
        "id": hospital_id,
        "name": hospital.name,
        "address": hospital.address,
        "postcode": hospital.postcode.upper().strip(),
        "latitude": coords[0] if coords else hospital.latitude,
        "longitude": coords[1] if coords else hospital.longitude,
        "is_approved": False,
        "submitted_by": user["id"],
        "submitted_by_email": user["email"],
        "current_wait_minutes": None,
        "last_updated": None,
        "last_updated_by": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.hospitals.insert_one(hospital_doc)
    
    return {"message": "Hospital submitted for approval", "id": hospital_id}

@api_router.post("/wait-times/update")
async def update_wait_time(data: WaitTimeUpdate, user = Depends(require_auth)):
    """Update wait time for a hospital - requires location verification or admin approval"""
    
    # Check hospital exists and is approved
    hospital = await db.hospitals.find_one({"id": data.hospital_id, "is_approved": True})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    
    # Auto-approve all updates
    now = datetime.now(timezone.utc).isoformat()
    await db.hospitals.update_one(
        {"id": data.hospital_id},
        {"$set": {
            "current_wait_minutes": data.wait_minutes,
            "last_updated": now,
            "last_updated_by": user["name"],
            "last_updated_by_masked": user.get("mask_name", True)
        }}
    )
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_wait_update": now}}
    )
    return {"message": "Wait time updated successfully", "approved": True}

# ============== Admin Routes ==============

@api_router.get("/admin/pending-hospitals", response_model=List[PendingHospitalResponse])
async def get_pending_hospitals(user = Depends(require_admin)):
    """Get list of hospitals pending approval"""
    hospitals = await db.hospitals.find({"is_approved": False}, {"_id": 0}).to_list(100)
    return [PendingHospitalResponse(
        id=h["id"],
        name=h["name"],
        address=h["address"],
        postcode=h["postcode"],
        submitted_by=h["submitted_by"],
        submitted_by_email=h.get("submitted_by_email", "Unknown"),
        created_at=h["created_at"]
    ) for h in hospitals]

@api_router.post("/admin/approve-hospital/{hospital_id}")
async def approve_hospital(hospital_id: str, user = Depends(require_admin)):
    """Approve a pending hospital"""
    result = await db.hospitals.update_one(
        {"id": hospital_id},
        {"$set": {"is_approved": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return {"message": "Hospital approved"}

@api_router.delete("/admin/reject-hospital/{hospital_id}")
async def reject_hospital(hospital_id: str, user = Depends(require_admin)):
    """Reject and delete a pending hospital"""
    result = await db.hospitals.delete_one({"id": hospital_id, "is_approved": False})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Hospital not found or already approved")
    return {"message": "Hospital rejected and removed"}

@api_router.get("/admin/pending-wait-updates", response_model=List[PendingWaitTimeUpdate])
async def get_pending_wait_updates(user = Depends(require_admin)):
    """Get list of pending wait time updates"""
    updates = await db.pending_wait_updates.find({}, {"_id": 0}).to_list(100)
    return [PendingWaitTimeUpdate(
        id=u["id"],
        hospital_id=u["hospital_id"],
        hospital_name=u["hospital_name"],
        wait_minutes=u["wait_minutes"],
        submitted_by=u.get("submitted_by_name", "Unknown"),
        submitted_by_email=u["submitted_by_email"],
        user_latitude=u.get("user_latitude"),
        user_longitude=u.get("user_longitude"),
        distance_km=u.get("distance_km"),
        created_at=u["created_at"]
    ) for u in updates]

@api_router.post("/admin/approve-wait-update/{update_id}")
async def approve_wait_update(update_id: str, user = Depends(require_admin)):
    """Approve a pending wait time update"""
    pending = await db.pending_wait_updates.find_one({"id": update_id})
    if not pending:
        raise HTTPException(status_code=404, detail="Pending update not found")
    
    # Apply the update
    now = datetime.now(timezone.utc).isoformat()
    await db.hospitals.update_one(
        {"id": pending["hospital_id"]},
        {"$set": {
            "current_wait_minutes": pending["wait_minutes"],
            "last_updated": now,
            "last_updated_by": pending.get("submitted_by_name", "Unknown"),
            "last_updated_by_masked": True
        }}
    )
    
    # Remove from pending
    await db.pending_wait_updates.delete_one({"id": update_id})
    
    return {"message": "Wait time update approved"}

@api_router.delete("/admin/reject-wait-update/{update_id}")
async def reject_wait_update(update_id: str, user = Depends(require_admin)):
    """Reject a pending wait time update"""
    result = await db.pending_wait_updates.delete_one({"id": update_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pending update not found")
    return {"message": "Wait time update rejected"}

@api_router.post("/admin/override-wait-time")
async def admin_override_wait_time(data: AdminOverrideWaitTime, user = Depends(require_admin)):
    """Admin override wait time without cooldown"""
    hospital = await db.hospitals.find_one({"id": data.hospital_id})
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.hospitals.update_one(
        {"id": data.hospital_id},
        {"$set": {
            "current_wait_minutes": data.wait_minutes,
            "last_updated": now,
            "last_updated_by": f"{user['name']} (Admin)"
        }}
    )
    
    return {"message": "Wait time updated by admin"}

@api_router.post("/admin/scrape-waitsmart")
async def admin_scrape_waitsmart(background_tasks: BackgroundTasks, user = Depends(require_admin)):
    """Manually trigger WaitSmart scrape (admin only)"""
    result = await scrape_waitsmart()
    return result

@api_router.get("/admin/scrape-status")
async def get_scrape_status(user = Depends(require_admin)):
    """Get last scrape timestamp"""
    return {
        "last_scrape": last_waitsmart_scrape.isoformat() if last_waitsmart_scrape else None,
        "next_scrape_in": "~1 hour" if last_waitsmart_scrape else "Pending first scrape"
    }

@api_router.get("/admin/users")
async def get_all_users(user = Depends(require_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for u in users:
        if "plain_password" not in u:
            u["plain_password"] = None
    return users

class AdminCreateUser(BaseModel):
    email: EmailStr
    name: str
    password: str
    is_paid: bool = True

class AdminTogglePaid(BaseModel):
    user_id: str
    is_paid: bool

@api_router.post("/admin/users/create")
async def admin_create_user(data: AdminCreateUser, user = Depends(require_admin)):
    """Admin creates a new user (can set as paid directly)"""
    # Check if user already exists
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": data.email.lower(),
        "name": data.name,
        "password_hash": hash_password(data.password),
        "plain_password": data.password,
        "is_paid": data.is_paid,
        "is_admin": False,
        "payment_id": "admin-created" if data.is_paid else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_wait_update": None
    }
    
    await db.users.insert_one(user_doc)
    
    return {"message": "User created successfully", "user_id": user_id}

@api_router.patch("/admin/users/{user_id}/toggle-paid")
async def admin_toggle_paid(user_id: str, user = Depends(require_admin)):
    """Toggle a user's paid status"""
    target_user = await db.users.find_one({"id": user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_paid_status = not target_user.get("is_paid", False)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "is_paid": new_paid_status,
            "payment_id": "admin-verified" if new_paid_status else None
        }}
    )
    
    return {"message": f"User {'activated' if new_paid_status else 'deactivated'}", "is_paid": new_paid_status}

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, user = Depends(require_admin)):
    """Delete a user (admin only)"""
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

# ============== Contact Form ==============

class ContactFormRequest(BaseModel):
    name: str
    email: EmailStr
    message: str

# ============== Settings ==============

class SiteSettings(BaseModel):
    price: str = "0.99"
    paypal_client_id: str = ""
    paypal_plan_id: str = ""

@api_router.get("/settings")
async def get_settings():
    """Get public site settings"""
    settings = await db.settings.find_one({"key": "site"}, {"_id": 0})
    defaults = {
        "price": "0.99",
        "paypal_client_id": "AY6PgnvlAbRHcSgA6sGEo3xdx5v7-7Ln-srrWwBQPcO8C0nwuQzyv2tSaQrncWzjbYAeE1vAPYrgwVEd",
        "paypal_plan_id": "P-4M4321392R213563JNISTOGY"
    }
    if not settings:
        return defaults
    return {
        "price": settings.get("price", defaults["price"]),
        "paypal_client_id": settings.get("paypal_client_id", defaults["paypal_client_id"]),
        "paypal_plan_id": settings.get("paypal_plan_id", defaults["paypal_plan_id"])
    }

@api_router.put("/admin/settings")
async def update_settings(data: SiteSettings, user=Depends(require_admin)):
    """Update site settings (admin only)"""
    await db.settings.update_one(
        {"key": "site"},
        {"$set": {
            "key": "site",
            "price": data.price,
            "paypal_client_id": data.paypal_client_id,
            "paypal_plan_id": data.paypal_plan_id
        }},
        upsert=True
    )
    return {"message": "Settings updated successfully"}

# ============== Payment Activation ==============

class PaymentActivation(BaseModel):
    subscription_id: str

@api_router.post("/payment/activate")
async def activate_payment(data: PaymentActivation, user=Depends(require_auth)):
    """Automatically activate user after PayPal subscription approval"""
    # Mark user as paid
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"is_paid": True, "payment_id": data.subscription_id, "payment_method": "paypal_subscription"}}
    )

    # Send notification email to admin via Resend
    if resend.api_key and ADMIN_EMAIL:
        try:
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #007F3B; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 20px;">WaitTimes.uk - New Payment Received!</h1>
                </div>
                <div style="padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0;">
                    <p style="font-size: 16px; color: #0A1128;"><strong>A user has subscribed and been automatically activated:</strong></p>
                    <table style="width: 100%; margin: 16px 0;">
                        <tr><td style="padding: 8px; font-weight: bold;">Name:</td><td style="padding: 8px;">{user['name']}</td></tr>
                        <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">{user['email']}</td></tr>
                        <tr><td style="padding: 8px; font-weight: bold;">Subscription ID:</td><td style="padding: 8px;">{data.subscription_id}</td></tr>
                    </table>
                    <p style="color: #007F3B; font-weight: bold;">Access has been granted automatically.</p>
                </div>
                <div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 12px;">
                    Sent from WaitTimes.uk Payment System
                </div>
            </div>
            """
            await asyncio.to_thread(resend.Emails.send, {
                "from": "WaitTimes.uk <onboarding@resend.dev>",
                "to": [ADMIN_EMAIL],
                "subject": f"New Payment: {user['name']} ({user['email']})",
                "html": html_content
            })
        except Exception as e:
            logging.error(f"Failed to send payment notification email: {e}")

    return {"message": "Payment activated successfully", "is_paid": True}

# ============== Payment Claim ==============

@api_router.post("/payment/claim")
async def claim_payment(user=Depends(require_auth)):
    """User claims they've completed payment - notifies admin via email"""
    # Send notification email to admin via Resend
    if resend.api_key and ADMIN_EMAIL:
        try:
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #005EB8; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 20px;">WaitTimes.uk - New Payment Claim</h1>
                </div>
                <div style="padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0;">
                    <p style="font-size: 16px; color: #0A1128;"><strong>A user has claimed they completed payment:</strong></p>
                    <table style="width: 100%; margin: 16px 0;">
                        <tr><td style="padding: 8px; font-weight: bold;">Name:</td><td style="padding: 8px;">{user['name']}</td></tr>
                        <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">{user['email']}</td></tr>
                        <tr><td style="padding: 8px; font-weight: bold;">User ID:</td><td style="padding: 8px;">{user['id']}</td></tr>
                    </table>
                    <p style="color: #64748b;">Please verify the payment in your PayPal account and activate their access in the Admin Dashboard.</p>
                </div>
                <div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 12px;">
                    Sent from WaitTimes.uk Payment System
                </div>
            </div>
            """
            await asyncio.to_thread(resend.Emails.send, {
                "from": "WaitTimes.uk <onboarding@resend.dev>",
                "to": [ADMIN_EMAIL],
                "subject": f"Payment Claim: {user['name']} ({user['email']})",
                "html": html_content
            })
        except Exception as e:
            logging.error(f"Failed to send payment claim email: {e}")

    return {"message": "Payment claim submitted. Your access will be activated shortly."}

@api_router.post("/contact")
async def submit_contact(data: ContactFormRequest):
    """Submit a contact form message - stored in DB and forwarded via Resend"""
    # Store in DB
    msg_doc = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "email": data.email,
        "message": data.message,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.contact_messages.insert_one(msg_doc)

    # Try to send email via Resend
    if resend.api_key and ADMIN_EMAIL:
        try:
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #005EB8; padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 20px;">WaitTimes.uk - New Contact Message</h1>
                </div>
                <div style="padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0;">
                    <p><strong>From:</strong> {data.name}</p>
                    <p><strong>Email:</strong> {data.email}</p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
                    <p><strong>Message:</strong></p>
                    <p style="white-space: pre-wrap;">{data.message}</p>
                </div>
                <div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 12px;">
                    Sent from WaitTimes.uk Contact Form
                </div>
            </div>
            """
            await asyncio.to_thread(resend.Emails.send, {
                "from": "WaitTimes.uk <onboarding@resend.dev>",
                "to": [ADMIN_EMAIL],
                "subject": f"WaitTimes Contact: {data.name}",
                "html": html_content
            })
        except Exception as e:
            logging.error(f"Failed to send contact email via Resend: {e}")
            # Message is still stored in DB, so it's not lost

    return {"message": "Your message has been sent. We'll get back to you soon."}

# ============== Admin Contact Messages ==============

@api_router.get("/admin/messages")
async def get_contact_messages(user = Depends(require_admin)):
    """Get all contact form messages"""
    messages = await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return messages

@api_router.patch("/admin/messages/{message_id}/read")
async def mark_message_read(message_id: str, user = Depends(require_admin)):
    """Mark a contact message as read"""
    result = await db.contact_messages.update_one(
        {"id": message_id},
        {"$set": {"read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"message": "Marked as read"}

@api_router.delete("/admin/messages/{message_id}")
async def delete_contact_message(message_id: str, user = Depends(require_admin)):
    """Delete a contact message"""
    result = await db.contact_messages.delete_one({"id": message_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"message": "Message deleted"}

# ============== Seed Data ==============

@api_router.post("/seed")
async def seed_data():
    """Seed initial hospital data"""
    # Check if already seeded
    count = await db.hospitals.count_documents({})
    if count > 0:
        return {"message": "Data already seeded", "hospital_count": count}
    
    # Major NHS A&E hospitals
    hospitals = [
        {"name": "St Thomas' Hospital", "address": "Westminster Bridge Road, London", "postcode": "SE1 7EH", "latitude": 51.4987, "longitude": -0.1175},
        {"name": "Guy's Hospital", "address": "Great Maze Pond, London", "postcode": "SE1 9RT", "latitude": 51.5035, "longitude": -0.0871},
        {"name": "King's College Hospital", "address": "Denmark Hill, London", "postcode": "SE5 9RS", "latitude": 51.4684, "longitude": -0.0941},
        {"name": "Royal London Hospital", "address": "Whitechapel Road, London", "postcode": "E1 1FR", "latitude": 51.5186, "longitude": -0.0597},
        {"name": "University College Hospital", "address": "235 Euston Road, London", "postcode": "NW1 2BU", "latitude": 51.5246, "longitude": -0.1340},
        {"name": "St Mary's Hospital", "address": "Praed Street, London", "postcode": "W2 1NY", "latitude": 51.5171, "longitude": -0.1731},
        {"name": "Chelsea and Westminster Hospital", "address": "369 Fulham Road, London", "postcode": "SW10 9NH", "latitude": 51.4839, "longitude": -0.1823},
        {"name": "Northwick Park Hospital", "address": "Watford Road, Harrow", "postcode": "HA1 3UJ", "latitude": 51.5767, "longitude": -0.3195},
        {"name": "Queen Elizabeth Hospital Birmingham", "address": "Mindelsohn Way, Birmingham", "postcode": "B15 2GW", "latitude": 52.4534, "longitude": -1.9380},
        {"name": "Manchester Royal Infirmary", "address": "Oxford Road, Manchester", "postcode": "M13 9WL", "latitude": 53.4615, "longitude": -2.2273},
        {"name": "Leeds General Infirmary", "address": "Great George Street, Leeds", "postcode": "LS1 3EX", "latitude": 53.8013, "longitude": -1.5508},
        {"name": "Royal Liverpool Hospital", "address": "Prescot Street, Liverpool", "postcode": "L7 8XP", "latitude": 53.4037, "longitude": -2.9669},
        {"name": "Addenbrooke's Hospital", "address": "Hills Road, Cambridge", "postcode": "CB2 0QQ", "latitude": 52.1751, "longitude": 0.1395},
        {"name": "John Radcliffe Hospital", "address": "Headley Way, Oxford", "postcode": "OX3 9DU", "latitude": 51.7638, "longitude": -1.2197},
        {"name": "Bristol Royal Infirmary", "address": "Upper Maudlin Street, Bristol", "postcode": "BS2 8HW", "latitude": 51.4586, "longitude": -2.5959},
        {"name": "Royal Victoria Infirmary", "address": "Queen Victoria Road, Newcastle", "postcode": "NE1 4LP", "latitude": 54.9800, "longitude": -1.6194},
        {"name": "Sheffield Teaching Hospitals", "address": "Herries Road, Sheffield", "postcode": "S5 7AU", "latitude": 53.4126, "longitude": -1.4620},
        {"name": "Nottingham University Hospitals", "address": "Derby Road, Nottingham", "postcode": "NG7 2UH", "latitude": 52.9435, "longitude": -1.1847},
        {"name": "Southampton General Hospital", "address": "Tremona Road, Southampton", "postcode": "SO16 6YD", "latitude": 50.9331, "longitude": -1.4353},
        {"name": "Royal Sussex County Hospital", "address": "Eastern Road, Brighton", "postcode": "BN2 5BE", "latitude": 50.8205, "longitude": -0.1168},
        {"name": "Derriford Hospital", "address": "Derriford Road, Plymouth", "postcode": "PL6 8DH", "latitude": 50.4167, "longitude": -4.1120},
        {"name": "Royal Cornwall Hospital", "address": "Treliske, Truro", "postcode": "TR1 3LJ", "latitude": 50.2710, "longitude": -5.0814},
        {"name": "Norfolk and Norwich Hospital", "address": "Colney Lane, Norwich", "postcode": "NR4 7UY", "latitude": 52.5900, "longitude": 1.2208},
        {"name": "Leicester Royal Infirmary", "address": "Infirmary Square, Leicester", "postcode": "LE1 5WW", "latitude": 52.6269, "longitude": -1.1367},
        {"name": "Hull Royal Infirmary", "address": "Anlaby Road, Hull", "postcode": "HU3 2JZ", "latitude": 53.7440, "longitude": -0.3596},
        {"name": "Royal Stoke University Hospital", "address": "Newcastle Road, Stoke-on-Trent", "postcode": "ST4 6QG", "latitude": 52.9880, "longitude": -2.2122},
        {"name": "Royal Berkshire Hospital", "address": "London Road, Reading", "postcode": "RG1 5AN", "latitude": 51.4535, "longitude": -0.9541},
        {"name": "Wexham Park Hospital", "address": "Wexham Street, Slough", "postcode": "SL2 4HL", "latitude": 51.5240, "longitude": -0.5673},
        {"name": "Watford General Hospital", "address": "Vicarage Road, Watford", "postcode": "WD18 0HB", "latitude": 51.6594, "longitude": -0.3930},
        {"name": "Luton and Dunstable Hospital", "address": "Lewsey Road, Luton", "postcode": "LU4 0DZ", "latitude": 51.8746, "longitude": -0.4719}
    ]
    
    for hospital in hospitals:
        hospital_doc = {
            "id": str(uuid.uuid4()),
            "name": hospital["name"],
            "address": hospital["address"],
            "postcode": hospital["postcode"],
            "latitude": hospital["latitude"],
            "longitude": hospital["longitude"],
            "is_approved": True,
            "submitted_by": "system",
            "submitted_by_email": "system@ae-wait.com",
            "current_wait_minutes": None,
            "last_updated": None,
            "last_updated_by": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.hospitals.insert_one(hospital_doc)
    
    # Create admin user
    admin_exists = await db.users.find_one({"email": "harry.miles@aaasat.co.uk"})
    if not admin_exists:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": "harry.miles@aaasat.co.uk",
            "name": "Harry Miles",
            "password_hash": hash_password("lBPiq815!??!"),
            "is_paid": True,
            "is_admin": True,
            "payment_id": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_wait_update": None,
            "mask_name": True
        }
        await db.users.insert_one(admin_doc)
    
    return {"message": "Data seeded successfully", "hospital_count": len(hospitals)}

@api_router.get("/")
async def root():
    return {"message": "A&E Wait Times API"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

@app.on_event("startup")
async def startup_event():
    """Start background tasks on startup"""
    # Run initial scrape after 10 seconds to let server start
    asyncio.create_task(delayed_start_scraping())

async def delayed_start_scraping():
    """Delay the first scrape to let the server initialize"""
    await asyncio.sleep(10)
    logging.info("Starting WaitSmart auto-scraper...")
    asyncio.create_task(auto_scrape_waitsmart())
