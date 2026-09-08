"""
Test suite for Contact Form and Admin Messages functionality
Tests the bug fixes:
1. Contact form now uses POST /api/contact instead of mailto:
2. Messages are stored in DB and viewable in admin dashboard
3. Admin can mark messages as read and delete them
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestContactFormEndpoint:
    """Tests for POST /api/contact endpoint"""
    
    def test_contact_form_success(self):
        """Test that contact form accepts valid data and returns success"""
        test_data = {
            "name": f"TEST_User_{uuid.uuid4().hex[:8]}",
            "email": "test@example.com",
            "message": "This is a test message from automated testing"
        }
        
        response = requests.post(f"{BASE_URL}/api/contact", json=test_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data
        assert "sent" in data["message"].lower() or "success" in data["message"].lower()
        print(f"Contact form submission successful: {data}")
    
    def test_contact_form_missing_name(self):
        """Test that contact form rejects missing name"""
        test_data = {
            "email": "test@example.com",
            "message": "Test message"
        }
        
        response = requests.post(f"{BASE_URL}/api/contact", json=test_data)
        assert response.status_code == 422, f"Expected 422 for missing name, got {response.status_code}"
    
    def test_contact_form_missing_email(self):
        """Test that contact form rejects missing email"""
        test_data = {
            "name": "Test User",
            "message": "Test message"
        }
        
        response = requests.post(f"{BASE_URL}/api/contact", json=test_data)
        assert response.status_code == 422, f"Expected 422 for missing email, got {response.status_code}"
    
    def test_contact_form_missing_message(self):
        """Test that contact form rejects missing message"""
        test_data = {
            "name": "Test User",
            "email": "test@example.com"
        }
        
        response = requests.post(f"{BASE_URL}/api/contact", json=test_data)
        assert response.status_code == 422, f"Expected 422 for missing message, got {response.status_code}"
    
    def test_contact_form_invalid_email(self):
        """Test that contact form rejects invalid email format"""
        test_data = {
            "name": "Test User",
            "email": "not-an-email",
            "message": "Test message"
        }
        
        response = requests.post(f"{BASE_URL}/api/contact", json=test_data)
        assert response.status_code == 422, f"Expected 422 for invalid email, got {response.status_code}"


class TestAdminMessagesEndpoints:
    """Tests for admin messages management endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        login_data = {
            "email": "harry.miles@aaasat.co.uk",
            "password": "lBPiq815!??!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json()["access_token"]
    
    @pytest.fixture
    def auth_headers(self, admin_token):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {admin_token}"}
    
    def test_get_messages_requires_auth(self):
        """Test that GET /api/admin/messages requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/messages")
        assert response.status_code == 403 or response.status_code == 401, \
            f"Expected 401/403 without auth, got {response.status_code}"
    
    def test_get_messages_success(self, auth_headers):
        """Test that admin can retrieve contact messages"""
        response = requests.get(f"{BASE_URL}/api/admin/messages", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of messages"
        print(f"Retrieved {len(data)} contact messages")
        
        # Verify message structure if any exist
        if len(data) > 0:
            msg = data[0]
            assert "id" in msg, "Message should have id"
            assert "name" in msg, "Message should have name"
            assert "email" in msg, "Message should have email"
            assert "message" in msg, "Message should have message"
            assert "read" in msg, "Message should have read status"
            assert "created_at" in msg, "Message should have created_at"
    
    def test_contact_form_stores_in_db(self, auth_headers):
        """Test that contact form submissions are stored in database"""
        # Submit a unique contact message
        unique_id = uuid.uuid4().hex[:8]
        test_data = {
            "name": f"TEST_DBStore_{unique_id}",
            "email": f"test_{unique_id}@example.com",
            "message": f"Test message for DB storage verification {unique_id}"
        }
        
        # Submit the contact form
        submit_response = requests.post(f"{BASE_URL}/api/contact", json=test_data)
        assert submit_response.status_code == 200, f"Contact form submission failed: {submit_response.text}"
        
        # Verify it appears in admin messages
        messages_response = requests.get(f"{BASE_URL}/api/admin/messages", headers=auth_headers)
        assert messages_response.status_code == 200
        
        messages = messages_response.json()
        found = any(m["name"] == test_data["name"] and m["email"] == test_data["email"] for m in messages)
        assert found, f"Submitted message not found in admin messages. Looking for name={test_data['name']}"
        print(f"Verified message stored in DB: {test_data['name']}")
    
    def test_mark_message_as_read(self, auth_headers):
        """Test PATCH /api/admin/messages/{id}/read marks message as read"""
        # First submit a new message
        unique_id = uuid.uuid4().hex[:8]
        test_data = {
            "name": f"TEST_MarkRead_{unique_id}",
            "email": f"markread_{unique_id}@example.com",
            "message": "Test message for mark as read"
        }
        requests.post(f"{BASE_URL}/api/contact", json=test_data)
        
        # Get messages to find our test message
        messages_response = requests.get(f"{BASE_URL}/api/admin/messages", headers=auth_headers)
        messages = messages_response.json()
        
        test_msg = next((m for m in messages if m["name"] == test_data["name"]), None)
        assert test_msg is not None, "Test message not found"
        
        # Mark as read
        read_response = requests.patch(
            f"{BASE_URL}/api/admin/messages/{test_msg['id']}/read",
            headers=auth_headers
        )
        assert read_response.status_code == 200, f"Mark as read failed: {read_response.text}"
        
        # Verify it's marked as read
        messages_response = requests.get(f"{BASE_URL}/api/admin/messages", headers=auth_headers)
        messages = messages_response.json()
        updated_msg = next((m for m in messages if m["id"] == test_msg["id"]), None)
        assert updated_msg is not None, "Message not found after marking as read"
        assert updated_msg["read"] == True, "Message should be marked as read"
        print(f"Successfully marked message as read: {test_msg['id']}")
    
    def test_delete_message(self, auth_headers):
        """Test DELETE /api/admin/messages/{id} deletes a message"""
        # First submit a new message
        unique_id = uuid.uuid4().hex[:8]
        test_data = {
            "name": f"TEST_Delete_{unique_id}",
            "email": f"delete_{unique_id}@example.com",
            "message": "Test message for deletion"
        }
        requests.post(f"{BASE_URL}/api/contact", json=test_data)
        
        # Get messages to find our test message
        messages_response = requests.get(f"{BASE_URL}/api/admin/messages", headers=auth_headers)
        messages = messages_response.json()
        
        test_msg = next((m for m in messages if m["name"] == test_data["name"]), None)
        assert test_msg is not None, "Test message not found"
        
        # Delete the message
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/messages/{test_msg['id']}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify it's deleted
        messages_response = requests.get(f"{BASE_URL}/api/admin/messages", headers=auth_headers)
        messages = messages_response.json()
        deleted_msg = next((m for m in messages if m["id"] == test_msg["id"]), None)
        assert deleted_msg is None, "Message should be deleted"
        print(f"Successfully deleted message: {test_msg['id']}")
    
    def test_mark_nonexistent_message_read(self, auth_headers):
        """Test marking non-existent message as read returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.patch(
            f"{BASE_URL}/api/admin/messages/{fake_id}/read",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for non-existent message, got {response.status_code}"
    
    def test_delete_nonexistent_message(self, auth_headers):
        """Test deleting non-existent message returns 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/admin/messages/{fake_id}",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for non-existent message, got {response.status_code}"


class TestNonAdminAccess:
    """Test that non-admin users cannot access admin messages endpoints"""
    
    @pytest.fixture
    def regular_user_token(self):
        """Create and login as a regular user"""
        unique_id = uuid.uuid4().hex[:8]
        user_data = {
            "name": f"TEST_RegularUser_{unique_id}",
            "email": f"regular_{unique_id}@example.com",
            "password": "testpass123"
        }
        
        # Register
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=user_data)
        if reg_response.status_code == 200:
            return reg_response.json()["access_token"]
        
        # If already exists, try login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
        if login_response.status_code == 200:
            return login_response.json()["access_token"]
        
        pytest.skip("Could not create/login regular user")
    
    def test_regular_user_cannot_get_messages(self, regular_user_token):
        """Test that regular users cannot access admin messages"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/messages", headers=headers)
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
