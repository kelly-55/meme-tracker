import os
import re
import json
import asyncio
from telethon import TelegramClient, events
from telethon.sessions import StringSession

# --- Configuration ---
API_ID = os.getenv('API_ID') or 'YOUR_API_ID'
API_HASH = os.getenv('API_HASH') or 'YOUR_API_HASH'
SESSION_STRING = os.getenv('SESSION_STRING') # Secret for CI/CD login
CHANNELS = ['MomentumTrackerCN','ceshi00008866'] # Channels to monitor
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
    # --- Regex Patterns ---
# Name: Match $TokenName or just TokenName at start, or specific format 💊 $NAME
NAME_PATTERN = r'\$([a-zA-Z0-9\._-]+)' 
# CA: Standard Solana/EVM address
CA_PATTERN = r'\b[a-zA-Z0-9]{32,44}\b'
# Market Cap: Matches "市值：$46.74K"
MCAP_PATTERN = r'市值[：:]\s*\$([0-9.]+[KMB]?)'
# Community: Matches "已在4个社区推广"
COMMUNITY_PATTERN = r'已在\s*(\d+)\s*个社区'
# First Promo Time: Matches "开盘后4秒在第一个社区推广"
FIRST_PROMO_PATTERN = r'开盘后\s*(.*?)\s*在第一个社区'

def extract_data(text):
    data = {}
    
    # 1. Extract CA (Mandatory)
    ca_match = re.search(CA_PATTERN, text)
    if ca_match:
        data['ca'] = ca_match.group(0)
    else:
        return None 
        
    # 2. Extract Name
    # Try to find $Name first
    name_match = re.search(NAME_PATTERN, text)
    if name_match:
        data['name'] = name_match.group(1)
    else:
        # Fallback: Take the first line if it looks like a header
        lines = text.strip().split('\n')
        if lines:
            # Clean up emojis and common prefixes
            clean_name = re.sub(r'[💊🟢💰]', '', lines[0]).strip()
            data['name'] = clean_name[:15] # Limit length
        else:
            data['name'] = "Unknown"
    
    # 3. Extract Market Cap
    mcap_match = re.search(MCAP_PATTERN, text)
    data['mcap'] = mcap_match.group(1) if mcap_match else "N/A"
    
    # 4. Extract Community Count
    comm_match = re.search(COMMUNITY_PATTERN, text)
    data['mentions'] = comm_match.group(1) if comm_match else "1"
    
    # 5. Extract First Promo Time
    time_match = re.search(FIRST_PROMO_PATTERN, text)
    data['time_since_open'] = time_match.group(1) if time_match else "暂无"
    
    return data

async def update_json(new_token):
    try:
        with open(OUTPUT_FILE, 'r') as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = []
    
    existing_ids = set(item['id'] for item in data)
    
    if new_token['id'] not in existing_ids:
        data.insert(0, new_token)
        data = data[:100]
        
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Saved new token: {new_token['name']} ({new_token['ca']})")

@client.on(events.NewMessage(chats=CHANNELS))
async def handler(event):
    text = event.message.message
    extracted_data = extract_data(text)
    
    if extracted_data:
        print(f"Found CA: {extracted_data['ca']} in {event.chat.title}")
        
        # Construct Token Object
        new_token = {
            "id": str(event.message.id),
            "name": extracted_data['name'], 
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
    
    # Ensure output file exists
    if not os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'w') as f:
            json.dump([], f)
            
    await client.start()
    
    # Check if running in GitHub Actions (CI environment)
    if os.getenv('GITHUB_ACTIONS') == 'true':
        print("Running in Batch Mode (GitHub Actions)...")
        
        # Only fetch messages from the last 30 minutes to avoid fetching old history
        # Since the Action runs every 10 minutes, 30 mins provides a safe overlap.
        from datetime import datetime, timedelta, timezone
        cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=30)
        print(f"Fetching messages since: {cutoff_time}")

        for channel in CHANNELS:
            try:
                print(f"Checking {channel}...")
                entity = await client.get_entity(channel)
                
                # Iterate messages (newest first)
                async for message in client.iter_messages(entity, limit=50):
                    # Stop if message is older than cutoff
                    if message.date < cutoff_time:
                        break
                        
                    if message.message:
                        # Debug: Print first 50 chars of message to see what's being checked
                        preview = message.message.replace('\n', ' ')[:50]
                        print(f"Checking msg {message.id}: {preview}...")
                        
                        extracted = extract_data(message.message)
                        if extracted:
                            new_token = {
                                "id": str(message.id),
                                "name": extracted['name'], 
                                "ca": extracted['ca'],
                                "channel": channel,
                                "timestamp": message.date.timestamp(),
                                "mcap": extracted['mcap'],
                                "mentions": extracted['mentions'],
                                "time_since_open": extracted['time_since_open']
                            }
                            await update_json(new_token)
                        else:
                            print(f"  -> No data extracted. (CA found? {bool(re.search(CA_PATTERN, message.message))})")
            except Exception as e:
                print(f"Error scraping {channel}: {e}")
        print("Batch scrape complete.")
    else:
        print("Running in Listener Mode (Local)...")
        print("Listening for new tokens...")
        await client.run_until_disconnected()

if __name__ == '__main__':
    with client:
        client.loop.run_until_complete(main())
