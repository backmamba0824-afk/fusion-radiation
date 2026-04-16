import re
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

def is_valid_company_url(url):
    """Filter out known portal sites or irrelevant links."""
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    
    # Exclude common job portals, review sites, SNS
    blacklist = [
        "youtube.com", "twitter.com", "facebook.com", "instagram.com",
        "linkedin.com", "note.com", "amazon.co.jp", "yahoo.co.jp", 
        "wikipedia.org", "pinterest.jp", "prtimes.jp", "doda.jp", "en-gage.net",
        "townwork.net", "mynavi.jp", "rikunabi.com", "bizreach.jp", "wantedly.com",
        "creators-station.jp", "kurashigoto.me", "green-japan.com",
        "duckduckgo.com", "google.com"
    ]
    
    for b in blacklist:
        if b in domain:
            return False
    return True

def search_duckduckgo(query, max_results=15):
    """Use Playwright to search DuckDuckGo and return a list of URLs."""
    urls = []
    print(f"🔍 Searching DuckDuckGo for: {query}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        try:
            # Using HTML version for easier scraping without JS blocking
            page.goto(f"https://html.duckduckgo.com/html/?q={query}")
            
            # Wait for results
            page.wait_for_selector(".result__a", timeout=10000)
            result_elements = page.query_selector_all(".result__a")
            
            for el in result_elements:
                link = el.get_attribute("href")
                if link and link.startswith("http"):
                    # Some links might be DuckDuckGo redirects, if so unquote them.
                    # Mostly html version uses direct links in href or ad redirect
                    if is_valid_company_url(link):
                        if link not in urls:
                            urls.append(link)
                if len(urls) >= max_results:
                    break
        except Exception as e:
            print(f"Error during DuckDuckGo search: {e}")
            
        browser.close()
    return urls

def extract_phone(text):
    # Regex for Japanese phone numbers (e.g. 03-1234-5678, 027-123-4567, 090-1234-5678)
    pattern = r'(0\d{1,4}-?\d{1,4}-?\d{3,4})'
    matches = re.findall(pattern, text)
    if matches:
        return matches[0]
    return None

def extract_email(text):
    pattern = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
    matches = re.findall(pattern, text)
    if matches:
        return matches[0]
    return None

def extract_contact_person(text):
    # Try to find representative near "代表取締役" or "代表者"
    pattern = r'(?:代表取締役|代表者|代表者名|代表)[^\w]*([一-龥ぁ-んァ-ヶa-zA-Z]{2,10})'
    matches = re.findall(pattern, text)
    if matches:
        # Ignore things like "について" etc.
        val = matches[0].strip()
        if len(val) > 1 and "について" not in val:
            return val
    return None

def scrape_company_info(url):
    """Visit the URL and its typical subpages to extract info."""
    print(f"  🕷️ Crawling: {url}")
    info = {
        "url": url,
        "name": "",
        "phone": None,
        "email_or_contact": None,
        "contact_person": None
    }
    
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            )
            
            # Set shorter timeout
            page.set_default_timeout(15000)
            page.goto(url)
            
            # Extract basic text
            main_text = page.inner_text("body")
            soup = BeautifulSoup(page.content(), "html.parser")
            
            # Extract Company Name from title
            title = page.title()
            # Often titles are like "ABC株式会社 | 〇〇の制作会社" - split by common separators
            parts = re.split(r'\||-|–|—|｜', title)
            if parts:
                info["name"] = parts[0].strip()
            
            # Gather sub URLs to explore further
            sub_pages = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text().strip().lower()
                full_url = urljoin(url, href)
                
                # Look for Contact Form
                if not info["email_or_contact"]:
                    if "contact" in href.lower() or "お問い合わせ" in text or "inquiry" in href.lower():
                        info["email_or_contact"] = full_url
                
                # Look for Company Profile
                if "about" in href.lower() or "company" in href.lower() or "会社概要" in text or "profile" in href.lower():
                    if full_url not in sub_pages and full_url.startswith("http"):
                        sub_pages.append(full_url)

            # Extract from main page first
            info["phone"] = extract_phone(main_text)
            
            if not info["email_or_contact"]:
                info["email_or_contact"] = extract_email(main_text)
                
            info["contact_person"] = extract_contact_person(main_text)
            
            # If info is missing, visit subpages (max 2)
            for sub_url in sub_pages[:2]:
                if all([info["phone"], info["email_or_contact"], info["contact_person"]]):
                    break # Everything found
                
                try:
                    page.goto(sub_url)
                    sub_text = page.inner_text("body")
                    
                    if not info["phone"]:
                        info["phone"] = extract_phone(sub_text)
                    if not info["email_or_contact"]:
                        info["email_or_contact"] = extract_email(sub_text)
                    if not info["contact_person"]:
                        info["contact_person"] = extract_contact_person(sub_text)
                except Exception:
                    pass

            browser.close()
        except Exception as e:
            print(f"  ❌ Error crawling {url}: {e}")
            
    return info
