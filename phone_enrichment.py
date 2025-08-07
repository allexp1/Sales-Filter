import os
import re
import requests
import logging
from typing import Dict, Optional, Tuple, Any
from cachetools import TTLCache
from base64 import b64encode

logger = logging.getLogger(__name__)

class PhoneEnrichment:
    """
    Phone number enrichment using free/freemium APIs:
    - Twilio Lookup API (pay-per-use, but has free trial)
    - Clearbit Person API (freemium - 100 requests/month)
    - Extract from email signatures or domains
    """
    
    def __init__(self):
        # API configurations
        self.twilio_account_sid = os.environ.get('TWILIO_ACCOUNT_SID', '')
        self.twilio_auth_token = os.environ.get('TWILIO_AUTH_TOKEN', '')
        self.clearbit_api_key = os.environ.get('CLEARBIT_API_KEY', '')
        
        # Cache for API responses (TTL = 24 hours)
        self.cache = TTLCache(maxsize=1000, ttl=86400)
        
        # Common phone patterns in email/names
        self.phone_patterns = [
            r'\+?1?\s*\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})',  # US/CA format
            r'\+?(\d{1,3})[\s.-]?(\d{3,4})[\s.-]?(\d{3,4})[\s.-]?(\d{3,4})',  # International
            r'\b(\d{10,15})\b',  # Simple number string
        ]
    
    def enrich_phone(self, email: str, name: str, domain: str) -> Dict[str, Any]:
        """
        Enrich phone number data using multiple methods
        
        Returns:
            Dict with keys: phone_number, phone_source, phone_verified,
                          phone_type, phone_carrier, score_adjustment
        """
        cache_key = f"phone:{email}"
        if cache_key in self.cache:
            logger.info(f"Returning cached phone data for {email}")
            return self.cache[cache_key]
        
        result = {
            'phone_number': None,
            'phone_source': None,
            'phone_verified': False,
            'phone_type': None,
            'phone_carrier': None,
            'score_adjustment': 0
        }
        
        # Try to extract phone from email/name first (free)
        extracted_phone = self._extract_phone_from_text(f"{name} {email}")
        if extracted_phone:
            result['phone_number'] = extracted_phone
            result['phone_source'] = 'extracted'
            
            # Verify with Twilio if available
            if self.twilio_account_sid and self.twilio_auth_token:
                twilio_data = self._twilio_lookup(extracted_phone)
                if twilio_data:
                    result.update(twilio_data)
                    result['phone_source'] = 'twilio_verified'
        
        # Try Clearbit if no phone found yet
        if not result['phone_number'] and self.clearbit_api_key:
            clearbit_data = self._clearbit_person_lookup(email)
            if clearbit_data:
                result.update(clearbit_data)
        
        # Apply scoring adjustments
        if result['phone_number']:
            result['score_adjustment'] = 10  # Base bonus for having phone
            if result['phone_verified']:
                result['score_adjustment'] += 5  # Extra for verified
            if result['phone_type'] == 'mobile':
                result['score_adjustment'] += 5  # Mobile phones are more valuable
        
        # Cache the result
        self.cache[cache_key] = result
        
        return result
    
    def _extract_phone_from_text(self, text: str) -> Optional[str]:
        """Extract phone number from text using regex patterns"""
        for pattern in self.phone_patterns:
            match = re.search(pattern, text)
            if match:
                # Clean and format the number
                phone = ''.join(match.groups())
                phone = re.sub(r'\D', '', phone)  # Keep only digits
                
                # Basic validation
                if 10 <= len(phone) <= 15:
                    # Format as international if not already
                    if len(phone) == 10:  # US number without country code
                        phone = f"+1{phone}"
                    elif not phone.startswith('+'):
                        phone = f"+{phone}"
                    
                    return phone
        
        return None
    
    def _twilio_lookup(self, phone_number: str) -> Optional[Dict[str, Any]]:
        """Lookup phone number using Twilio API"""
        if not self.twilio_account_sid or not self.twilio_auth_token:
            return None
        
        try:
            # Ensure phone number has + prefix
            if not phone_number.startswith('+'):
                phone_number = f"+{phone_number}"
            
            url = f"https://lookups.twilio.com/v2/PhoneNumbers/{phone_number}"
            
            # Basic auth
            auth_string = f"{self.twilio_account_sid}:{self.twilio_auth_token}"
            auth_bytes = auth_string.encode('ascii')
            auth_b64 = b64encode(auth_bytes).decode('ascii')
            
            headers = {
                'Authorization': f'Basic {auth_b64}'
            }
            
            # Add fields for carrier and caller name (additional cost but more data)
            params = {
                'Fields': 'line_type_intelligence,carrier'
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                phone_type = 'unknown'
                line_type = data.get('line_type_intelligence', {}).get('type')
                if line_type:
                    phone_type = line_type.lower()
                
                carrier_name = data.get('carrier', {}).get('name', 'Unknown')
                
                return {
                    'phone_number': data.get('phone_number'),
                    'phone_verified': True,
                    'phone_type': phone_type,
                    'phone_carrier': carrier_name,
                    'phone_source': 'twilio'
                }
            
        except Exception as e:
            logger.error(f"Twilio lookup failed for {phone_number}: {e}")
        
        return None
    
    def _clearbit_person_lookup(self, email: str) -> Optional[Dict[str, Any]]:
        """Lookup person data including phone using Clearbit"""
        if not self.clearbit_api_key:
            return None
        
        try:
            url = f"https://person-stream.clearbit.com/v2/people/find?email={email}"
            headers = {'Authorization': f'Bearer {self.clearbit_api_key}'}
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                # Extract phone if available
                phone = None
                phone_numbers = data.get('phoneNumbers', [])
                
                # Prefer mobile numbers
                for number in phone_numbers:
                    if number.get('type') == 'mobile':
                        phone = number.get('number')
                        break
                
                # Fall back to any phone
                if not phone and phone_numbers:
                    phone = phone_numbers[0].get('number')
                
                if phone:
                    # Clean the phone number
                    phone = re.sub(r'\D', '', phone)
                    if len(phone) == 10:  # US number without country code
                        phone = f"+1{phone}"
                    elif not phone.startswith('+'):
                        phone = f"+{phone}"
                    
                    return {
                        'phone_number': phone,
                        'phone_source': 'clearbit',
                        'phone_verified': True,  # Clearbit data is generally reliable
                        'phone_type': 'mobile' if any(n.get('type') == 'mobile' for n in phone_numbers) else 'unknown'
                    }
            
        except Exception as e:
            logger.error(f"Clearbit person lookup failed for {email}: {e}")
        
        return None
    
    def format_phone_display(self, phone_number: Optional[str]) -> str:
        """Format phone number for display"""
        if not phone_number:
            return ''
        
        # Remove non-digits
        digits = re.sub(r'\D', '', phone_number)
        
        # Format based on length
        if len(digits) == 11 and digits.startswith('1'):
            # US/CA format: +1 (XXX) XXX-XXXX
            return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:11]}"
        elif len(digits) == 10:
            # US/CA without country code
            return f"({digits[0:3]}) {digits[3:6]}-{digits[6:10]}"
        else:
            # Keep original format for international
            return phone_number