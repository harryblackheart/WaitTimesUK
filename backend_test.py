import requests
import sys
from datetime import datetime
import json

class AEWaitTimesAPITester:
    def __init__(self, base_url="https://a-and-e-lookup.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.user_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                details += f" (Expected {expected_status})"
                try:
                    error_data = response.json()
                    if 'detail' in error_data:
                        details += f" - {error_data['detail']}"
                except:
                    details += f" - {response.text[:100]}"

            self.log_test(name, success, details)
            
            if success:
                try:
                    return response.json()
                except:
                    return {}
            return None

        except Exception as e:
            self.log_test(name, False, f"Error: {str(e)}")
            return None

    def test_seed_data(self):
        """Test seeding initial data"""
        print("\n🌱 Testing Data Seeding...")
        result = self.run_test("Seed Data", "POST", "seed", 200)
        return result is not None

    def test_admin_login(self):
        """Test admin login"""
        print("\n🔐 Testing Admin Authentication...")
        result = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "admin@ae-wait.com", "password": "Admin123!"}
        )
        
        if result and 'access_token' in result:
            self.admin_token = result['access_token']
            # Verify admin user details
            user = result.get('user', {})
            if user.get('is_admin'):
                self.log_test("Admin User Verification", True)
            else:
                self.log_test("Admin User Verification", False, "User is not admin")
            return True
        return False

    def test_user_registration(self):
        """Test user registration"""
        print("\n👤 Testing User Registration...")
        timestamp = datetime.now().strftime('%H%M%S')
        test_user = {
            "name": f"Test User {timestamp}",
            "email": f"test{timestamp}@example.com",
            "password": "TestPass123!",
            "payment_id": f"PAYPAL-{timestamp}"
        }
        
        result = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data=test_user
        )
        
        if result and 'access_token' in result:
            self.user_token = result['access_token']
            return True
        return False

    def test_get_hospitals(self):
        """Test getting hospitals list"""
        print("\n🏥 Testing Hospital Endpoints...")
        
        # Test without authentication
        result = self.run_test("Get Hospitals (No Auth)", "GET", "hospitals", 200)
        
        if result:
            hospitals_count = len(result)
            self.log_test(f"Hospitals Count Check", hospitals_count > 0, f"Found {hospitals_count} hospitals")
            
            # Check if hospitals have required fields
            if hospitals_count > 0:
                hospital = result[0]
                required_fields = ['id', 'name', 'address', 'postcode', 'is_approved']
                missing_fields = [field for field in required_fields if field not in hospital]
                
                if not missing_fields:
                    self.log_test("Hospital Data Structure", True)
                else:
                    self.log_test("Hospital Data Structure", False, f"Missing fields: {missing_fields}")

        # Test with postcode search
        self.run_test("Postcode Search (SW1A 1AA)", "GET", "hospitals?postcode=SW1A 1AA", 200)
        
        # Test sort by wait time
        self.run_test("Sort by Wait Time", "GET", "hospitals?sort_by=wait_time", 200)

    def test_wait_time_update(self):
        """Test wait time update (requires paid user)"""
        print("\n⏰ Testing Wait Time Updates...")
        
        if not self.user_token:
            self.log_test("Wait Time Update", False, "No user token available")
            return
        
        # First get a hospital ID
        hospitals = self.run_test("Get Hospitals for Update", "GET", "hospitals", 200)
        if not hospitals or len(hospitals) == 0:
            self.log_test("Wait Time Update", False, "No hospitals available")
            return
        
        hospital_id = hospitals[0]['id']
        
        # Try to update wait time
        result = self.run_test(
            "Update Wait Time",
            "POST",
            "wait-times/update",
            200,
            data={"hospital_id": hospital_id, "wait_minutes": 90},
            token=self.user_token
        )

    def test_admin_endpoints(self):
        """Test admin-only endpoints"""
        print("\n👑 Testing Admin Endpoints...")
        
        if not self.admin_token:
            self.log_test("Admin Endpoints", False, "No admin token available")
            return
        
        # Test pending hospitals
        self.run_test("Get Pending Hospitals", "GET", "admin/pending-hospitals", 200, token=self.admin_token)
        
        # Test get all users
        result = self.run_test("Get All Users", "GET", "admin/users", 200, token=self.admin_token)
        
        if result:
            users_count = len(result)
            self.log_test(f"Users Count Check", users_count > 0, f"Found {users_count} users")
        
        # Test admin override wait time
        hospitals = self.run_test("Get Hospitals for Override", "GET", "hospitals", 200, token=self.admin_token)
        if hospitals and len(hospitals) > 0:
            hospital_id = hospitals[0]['id']
            self.run_test(
                "Admin Override Wait Time",
                "POST",
                "admin/override-wait-time",
                200,
                data={"hospital_id": hospital_id, "wait_minutes": 120},
                token=self.admin_token
            )

    def test_auth_protection(self):
        """Test authentication protection"""
        print("\n🛡️ Testing Authentication Protection...")
        
        # Test protected endpoints without token
        self.run_test("Protected Endpoint (No Auth)", "GET", "auth/me", 401)
        self.run_test("Admin Endpoint (No Auth)", "GET", "admin/users", 401)
        
        # Test admin endpoint with user token
        if self.user_token:
            self.run_test("Admin Endpoint (User Token)", "GET", "admin/users", 403, token=self.user_token)

    def test_hospital_submission(self):
        """Test hospital submission"""
        print("\n🏥 Testing Hospital Submission...")
        
        if not self.user_token:
            self.log_test("Hospital Submission", False, "No user token available")
            return
        
        timestamp = datetime.now().strftime('%H%M%S')
        new_hospital = {
            "name": f"Test Hospital {timestamp}",
            "address": f"Test Address {timestamp}",
            "postcode": "SW1A 1AA"
        }
        
        self.run_test(
            "Submit New Hospital",
            "POST",
            "hospitals/submit",
            200,
            data=new_hospital,
            token=self.user_token
        )

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting A&E Wait Times API Tests")
        print(f"Testing against: {self.base_url}")
        print("=" * 50)
        
        # Test basic connectivity
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            if response.status_code == 200:
                self.log_test("API Connectivity", True)
            else:
                self.log_test("API Connectivity", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("API Connectivity", False, str(e))
            print("❌ Cannot connect to API. Stopping tests.")
            return self.generate_report()
        
        # Run tests in order
        self.test_seed_data()
        self.test_admin_login()
        self.test_user_registration()
        self.test_get_hospitals()
        self.test_wait_time_update()
        self.test_hospital_submission()
        self.test_admin_endpoints()
        self.test_auth_protection()
        
        return self.generate_report()

    def generate_report(self):
        """Generate test report"""
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            success = True
        else:
            print("⚠️ Some tests failed:")
            failed_tests = [test for test in self.test_results if not test['success']]
            for test in failed_tests:
                print(f"   - {test['test']}: {test['details']}")
            success = False
        
        return {
            "success": success,
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "failed_tests": self.tests_run - self.tests_passed,
            "test_results": self.test_results
        }

def main():
    tester = AEWaitTimesAPITester()
    report = tester.run_all_tests()
    return 0 if report["success"] else 1

if __name__ == "__main__":
    sys.exit(main())