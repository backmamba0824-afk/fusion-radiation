import os
from dotenv import load_dotenv
from notion_client import Client
from notion_client.errors import APIResponseError

load_dotenv()

NOTION_API_TOKEN = os.getenv("NOTION_API_TOKEN")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

if not NOTION_API_TOKEN or not NOTION_DATABASE_ID:
    print("Warning: NOTION_API_TOKEN or NOTION_DATABASE_ID is not set in .env")

notion = Client(auth=NOTION_API_TOKEN) if NOTION_API_TOKEN else None

def get_db_schema():
    if not notion:
        return {}
    try:
        db = notion.databases.retrieve(database_id=NOTION_DATABASE_ID)
        return db.get("properties", {})
    except Exception as e:
        print(f"Failed to fetch Notion schema: {e}")
        return {}

def get_existing_urls():
    if not notion or not NOTION_DATABASE_ID:
        return set()
        
    existing_urls = set()
    try:
        has_more = True
        next_cursor = None
        
        while has_more:
            if next_cursor:
                response = notion.databases.query(
                    database_id=NOTION_DATABASE_ID,
                    start_cursor=next_cursor
                )
            else:
                response = notion.databases.query(
                    database_id=NOTION_DATABASE_ID
                )
                
            for page in response.get("results", []):
                props = page.get("properties", {})
                for prop_name, prop_data in props.items():
                    if prop_data.get("type") == "url":
                        url_val = prop_data.get("url")
                        if url_val:
                            existing_urls.add(url_val.rstrip('/'))
                
            has_more = response.get("has_more", False)
            next_cursor = response.get("next_cursor")
            
        return existing_urls
    except Exception as e:
        print(f"Error fetching existing URLs from Notion: {e}")
        return set()

def create_rich_text(content):
    return [{"text": {"content": str(content)[:2000]}}] if content else []

def add_company_to_notion(company_data, schema=None):
    if not notion or not NOTION_DATABASE_ID:
        print(f"Skipping Notion insert for {company_data.get('name')} (Credentials missing)")
        return False

    if not schema:
        schema = get_db_schema()

    properties = {}
    title_prop_name = "会社名"
    for name, prop in schema.items():
        if prop["type"] == "title":
            title_prop_name = name
            break
            
    properties[title_prop_name] = {"title": create_rich_text(company_data.get("name", "Unknown Company"))}

    # URL property handling
    url_set = False
    for name, prop in schema.items():
        if "url" in name.lower() or "url" in name:
            if prop["type"] == "url":
                properties[name] = {"url": company_data.get("url")}
                url_set = True
                break
    if not url_set:
        properties["会社URL"] = {"url": company_data.get("url")}

    # Phone property handling
    phone_val = company_data.get("phone")
    if phone_val:
        prop_type = schema.get("電話番号", {}).get("type", "phone_number")
        if prop_type == "phone_number":
            properties["電話番号"] = {"phone_number": phone_val[:20]}
        else:
            properties["電話番号"] = {"rich_text": create_rich_text(phone_val)}

    # Contact property handling
    contact_val = company_data.get("email_or_contact")
    if contact_val:
        contact_prop = "メールアドレス または フォームURL"
        if contact_prop in schema:
            prop_type = schema[contact_prop]["type"]
            if prop_type == "url":
                if contact_val.startswith("http"):
                    properties[contact_prop] = {"url": contact_val}
            elif prop_type == "email":
                if "@" in contact_val:
                    properties[contact_prop] = {"email": contact_val}
            else:
                properties[contact_prop] = {"rich_text": create_rich_text(contact_val)}
        else:
            properties["メールアドレス または フォームURL"] = {"rich_text": create_rich_text(contact_val)}

    # Contact person handling
    person_val = company_data.get("contact_person")
    if person_val:
        person_prop = "担当者名/代表者名"
        if "担当者名 または 代表者名" in schema:
            person_prop = "担当者名 または 代表者名"
        
        properties[person_prop] = {"rich_text": create_rich_text(person_val)}

    try:
        notion.pages.create(
            parent={"database_id": NOTION_DATABASE_ID},
            properties=properties
        )
        print(f"✅ Added {company_data.get('name')} to Notion.")
        return True
    except APIResponseError as e:
        print(f"❌ Failed to add {company_data.get('name')} to Notion: {e}")
        # Print payload for debugging
        print(properties)
        return False
