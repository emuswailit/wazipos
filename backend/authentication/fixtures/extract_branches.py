import pdfplumber
import json
import uuid

# This is the exact map of Bank Codes to the Entity UUIDs generated in the previous step
BANK_MAP = {
    "01": "01a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c",
    "02": "02b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d",
    "03": "03c4d5e6-f7a8-4b9c-0d1e-2f3a4b5c6d7e",
    "05": "04d5e6f7-a8b9-4c0d-1e2f-3a4b5c6d7e8f",
    "06": "05e6f7a8-b9c0-4d1e-2f3a-4b5c6d7e8f9a",
    "07": "06f7a8b9-c0d1-4e2f-3a4b-5c6d7e8f9a0b",
    "09": "07a8b9c0-d1e2-4f3a-4b5c-6d7e8f9a0b1c",
    "10": "08b9c0d1-e2f3-4a4b-5c6d-7e8f9a0b1c2d",
    "11": "09c0d1e2-f3a4-4b5c-6d7e-8f9a0b1c2d3e",
    "12": "10d1e2f3-a4b5-4c6d-7e8f-9a0b1c2d3e4f",
    "14": "11e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a",
    "16": "12f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b",
    "17": "13a4b5c6-d7e8-4f9a-0b1c-2d3e4f5a6b7c",
    "18": "14b5c6d7-e8f9-4a0b-1c2d-3e4f5a6b7c8d",
    "19": "15c6d7e8-f9a0-4b1c-2d3e-4f5a6b7c8d9e",
    "23": "16d7e8f9-a0b1-4c2d-3e4f-5a6b7c8d9e0f",
    "25": "17e8f9a0-b1c2-4d3e-4f5a-6b7c8d9e0f1a",
    "26": "18f9a0b1-c2d3-4e4f-5a6b-7c8d9e0f1a2b",
    "31": "19a0b1c2-d3e4-4f5a-6b7c-8d9e0f1a2b3c",
    "35": "20b1c2d3-e4f5-4a6b-7c8d-9e0f1a2b3c4d",
    "43": "21c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "49": "22d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
    "50": "23e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a",
    "51": "24f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b",
    "53": "25a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c",
    "54": "26b7c8d9-e0f1-4a2b-3c4d-5e6f7a8b9c0d",
    "55": "27c8d9e0-f1a2-4b3c-4d5e-6f7a8b9c0d1e",
    "57": "28d9e0f1-a2b3-4c4d-5e6f-7a8b9c0d1e2f",
    "59": "29e0f1a2-b3c4-4d5e-6f7a-8b9c0d1e2f3a",
    "60": "30f1a2b3-c4d5-4e6f-7a8b-9c0d1e2f3a4b",
    "61": "31a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5d",
    "62": "32b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6e",
    "63": "33c4d5e6-f7a8-4b9c-0d1e-2f3a4b5c6d7f",
    "65": "34d5e6f7-a8b9-4c0d-1e2f-3a4b5c6d7e80",
    "66": "35e6f7a8-b9c0-4d1e-2f3a-4b5c6d7e8f91",
    "68": "36f7a8b9-c0d1-4e2f-3a4b-5c6d7e8f9a02",
    "70": "37a8b9c0-d1e2-4f3a-4b5c-6d7e8f9a0b13",
    "72": "38b9c0d1-e2f3-4a4b-5c6d-7e8f9a0b1c24",
    "74": "39c0d1e2-f3a4-4b5c-6d7e-8f9a0b1c2d35",
    "75": "40d1e2f3-a4b5-4c6d-7e8f-9a0b1c2d3e46",
    "76": "41e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f57",
    "78": "42f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a68",
    "79": "43a4b5c6-d7e8-4f9a-0b1c-2d3e4f5a6b79",
    "80": "44b5c6d7-e8f9-4a0b-1c2d-3e4f5a6b7c80",
}

def clean_text(text):
    """Clean up the text extracted from the PDF."""
    if not text:
        return ""
    return str(text).strip().upper()

def extract_branches_from_pdf(pdf_path, output_json_path):
    fixture = []
    
    print("Opening PDF...")
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables()
            
            for table in tables:
                for row in table:
                    # Ensure row has enough columns
                    if not row or len(row) < 4:
                        continue
                        
                    bank_name = clean_text(row[0])
                    bank_code = clean_text(row[1])
                    branch_code = clean_text(row[2])
                    branch_name = clean_text(row[3])
                    
                    # Skip header rows or empty rows
                    if bank_name == 'BANK NAME' or not bank_code:
                        continue
                        
                    # Pad bank code to 2 digits (e.g., '1' -> '01')
                    bank_code = str(bank_code).zfill(2)
                    
                    # Check if we have a UUID mapped for this bank
                    if bank_code in BANK_MAP:
                        record = {
                            "model": "authentication.Branches",
                            "pk": str(uuid.uuid4()),
                            "fields": {
                                "entity": BANK_MAP[bank_code],
                                "title": branch_name,
                                "branch_code": branch_code,
                                "is_verified": "true",
                                "is_active": "true"
                            }
                        }
                        fixture.append(record)
                    else:
                        print(f"Warning: No Entity UUID mapped for bank code {bank_code} ({bank_name})")
            
            print(f"Processed page {page_num}/{len(pdf.pages)}...")
            
    # Write to JSON file
    print(f"Writing {len(fixture)} branches to {output_json_path}...")
    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(fixture, f, indent=2)
        
    print("Done!")

if __name__ == "__main__":
    # Ensure this matches the exact filename of your PDF
    PDF_FILE = "Bank-and-Branches-July-2023v.pdf" 
    OUTPUT_FILE = "branches_fixture.json"
    
    extract_branches_from_pdf(PDF_FILE, OUTPUT_FILE)