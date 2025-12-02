import os
import re
import json
import asyncio
from telethon import TelegramClient, events
from telethon.sessions import StringSession

# --- Configuration ---
# Try to get from Environment Variables (GitHub Actions), else use placeholder/local
API_ID = os.getenv('API_ID') or 'YOUR_API_ID'
API_HASH = os.getenv('API_HASH') or 'YOUR_API_HASH'
SESSION_STRING = os.getenv('SESSION_STRING') # New secret for CI/CD login
CHANNELS = [ 'MomentumTrackerCN2'] # Channels to monitor
OUTPUT_FILE = 'meme_data.json'

# --- Regex Patterns ---
CA_PATTERN = r'\b[a-zA-Z0-9]{32,44}\b'
MCAP_PATTERN = r'市值[:：]\s*\$([0-9.]+[KMB]?)'
COMMUNITY_PATTERN = r'已在\s*(\d+)\s*个社区'
TIME_PATTERN = r'开盘后\s*(.*?)\s*在'
NAME_PATTERN = r'\$([a-zA-Z0-9]+)' # Simple capture for $TokenName

# Initialize Client
print(f"DEBUG: Running in GitHub Actions? {os.getenv('GITHUB_ACTIONS')}")
print(f"DEBUG: API_ID present? {bool(API_ID)}")
print(f"DEBUG: API_HASH present? {bool(API_HASH)}")
print(f"DEBUG: SESSION_STRING length: {len(SESSION_STRING) if SESSION_STRING else 'None'}")

if SESSION_STRING:
    print("DEBUG: Using StringSession from Env Var.")
    # Use StringSession for GitHub Actions (Non-interactive)
    client = TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)
else:
    if os.getenv('GITHUB_ACTIONS') == 'true':
        raise ValueError("CRITICAL ERROR: SESSION_STRING is missing or empty in GitHub Actions! Please check your Secrets.")
    
    print("DEBUG: Using File Session (Local).")
    # Use File Session for Local Run (Interactive first time)
    client = TelegramClient('meme_scraper_session', API_ID, API_HASH)

def extract_data(text):
    data = {}
    
    # Extract CA
    ca_match = re.search(CA_PATTERN, text)
    if ca_match:
        data['ca'] = ca_match.group(0)
    else:
        return None # CA is mandatory
        
    # Extract Name (Try $Name first, else default)
    name_match = re.search(NAME_PATTERN, text)
    data['name'] = name_match.group(1) if name_match else "Unknown"
    
    # Extract Market Cap
    mcap_match = re.search(MCAP_PATTERN, text)
    data['mcap'] = mcap_match.group(1) if mcap_match else "N/A"
    
    # Extract Community Count
    comm_match = re.search(COMMUNITY_PATTERN, text)
    data['mentions'] = comm_match.group(1) if comm_match else "1"
    
    # Extract Time
    time_match = re.search(TIME_PATTERN, text)
    data['time_since_open'] = time_match.group(1) if time_match else ""
    
    return data

async def update_json(new_token):
    try:
        with open(OUTPUT_FILE, 'r') as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    
    # Check for duplicates based on CA or ID
    # Since ID might be same across runs if we fetch history, checking CA is safer for unique tokens
    # But same CA can be mentioned again. Let's check ID to avoid re-adding same message.
    existing_ids = set(item['id'] for item in data)
    
    if new_token['id'] not in existing_ids:
        # Add new token to top
        data.insert(0, new_token)
        # Keep only last 100
        data = data[:100]
        
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Saved new token: {new_token['name']} ({new_token['ca']})")
    else:
        # print(f"Token already exists: {new_token['id']}")
        pass

@client.on(events.NewMessage(chats=CHANNELS))
async def handler(event):
    text = event.message.message
    extracted_data = extract_data(text)
    
    if extracted_data:
        print(f"Found CA: {extracted_data['ca']} in {event.chat.title}")
        
        # Construct Token Object
        new_token = {
            "id": str(event.message.id),
            "name": extracted_data['name'], # Frontend will fetch real name from DexScreener
            "ca": extracted_data['ca'],
            "channel": event.chat.title,
            "timestamp": event.date.timestamp(),
            "mcap": extracted_data['mcap'],
            "mentions": extracted_data['mentions'],
            "time_since_open": extracted_data['time_since_open']
        }
        
        await update_json(new_token)

async def main():
    print("Starting Scraper...")
    
    # Ensure output file exists (to prevent git add errors if no data found)
    if not os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'w') as f:
            json.dump([], f)
            
    await client.start()
    
    # Check if running in GitHub Actions (CI environment)
    if os.getenv('GITHUB_ACTIONS') == 'true':
        print("Running in Batch Mode (GitHub Actions)...")
        # Fetch last 50 messages from each channel
        for channel in CHANNELS:
            try:
                print(f"Checking {channel}...")
                # Get entity first to ensure we can access it
                entity = await client.get_entity(channel)
                async for message in client.iter_messages(entity, limit=50):
                    if message.message:
                        extracted = extract_data(message.message)
                        if extracted:
                            new_token = {
                                "id": str(message.id),
                                "name": extracted['name'], 
                                "ca": extracted['ca'],
                                "channel": channel, # Use channel name/username
                                "timestamp": message.date.timestamp(),
                                "mcap": extracted['mcap'],
                                "mentions": extracted['mentions'],
                                "time_since_open": extracted['time_since_open']
                            }
                            # We need a way to avoid duplicates efficiently, 
                            # but update_json handles insertion. 
                            # Ideally we check if ID exists.
                            await update_json(new_token)
            except Exception as e:
                print(f"Error scraping {channel}: {e}")
        print("Batch scrape complete.")
    else:
        print("Running in Listener Mode (Local)...")
        print("Listening for new tokens...")
        await client.run_until_disconnected()

if __name__ == '__main__':
    # Instructions:
    # 1. pip install telethon
    # 2. Fill in API_ID and API_HASH
    # 3. Run: python scraper.py
    with client:
        client.loop.run_until_complete(main())
