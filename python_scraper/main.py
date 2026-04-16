import time
from notion_api import get_existing_urls, add_company_to_notion, get_db_schema
from scraper import search_duckduckgo, scrape_company_info

KEYWORDS = [
    "群馬 映像制作",
    "群馬 SNS運用支援",
    "群馬 広告代理店",
    "群馬 Web制作"
]

def main():
    print("🚀 Starting Lead Scraper Workflow")
    
    # 1. Get Schema and Existing URLs from Notion to prevent duplicates
    schema = get_db_schema()
    if not schema:
        print("❌ Could not connect to Notion Database. Please check your .env credentials.")
        return

    print("Fetching existing records from Notion...")
    existing_urls = get_existing_urls()
    print(f"✅ Found {len(existing_urls)} existing records.")

    all_found_urls = set()

    # 2. Search for each keyword
    for keyword in KEYWORDS:
        print(f"\n--- Processing Keyword: {keyword} ---")
        urls = search_duckduckgo(keyword, max_results=10)
        
        for url in urls:
            # Normalize url for duplicate check
            check_url = url.rstrip('/')
            
            if check_url in existing_urls or check_url in all_found_urls:
                print(f"  ⏭️ Skipping {url} (Already exists)")
                continue
                
            all_found_urls.add(check_url)
            
            # 3. Scrape Info
            company_data = scrape_company_info(url)
            
            # Require at least name or wait, always try to save
            if company_data["name"]:
                print(f"  📝 Extracted: {company_data['name']} (Phone: {company_data['phone']})")
                
                # 4. Insert into Notion
                success = add_company_to_notion(company_data, schema)
                if success:
                    existing_urls.add(check_url)
                    
            time.sleep(2) # Be polite

    print("\n🎉 Scraping Completed!")

if __name__ == "__main__":
    main()
