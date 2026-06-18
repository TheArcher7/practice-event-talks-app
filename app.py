import requests
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template

app = Flask(__name__, template_folder="templates", static_folder="static")

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/releases")
def get_releases():
    try:
        # Fetch the feed
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        response = requests.get(FEED_URL, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Parse XML
        root = ET.fromstring(response.content)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        entries = []
        for entry in root.findall("atom:entry", ns):
            title_el = entry.find("atom:title", ns)
            id_el = entry.find("atom:id", ns)
            updated_el = entry.find("atom:updated", ns)
            
            # Find the alternate link, fallback to any link
            link_el = entry.find("atom:link[@rel='alternate']", ns)
            if link_el is None:
                link_el = entry.find("atom:link", ns)
                
            content_el = entry.find("atom:content", ns)
            
            title = title_el.text if title_el is not None else ""
            entry_id = id_el.text if id_el is not None else ""
            updated = updated_el.text if updated_el is not None else ""
            link = link_el.attrib.get("href", "") if link_el is not None else ""
            content = content_el.text if content_el is not None else ""
            
            entries.append({
                "id": entry_id,
                "title": title,
                "updated": updated,
                "link": link,
                "content": content
            })
            
        return jsonify({
            "status": "success",
            "entries": entries
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
