import sys
import os
import sqlite3
from getpass import getpass
from validate_email import validate

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///lease_management.db')

def init_db():
    conn = sqlite3.connect(DATABASE_URL.split('://')[1])
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS admins (email TEXT PRIMARY KEY, full_name TEXT, password TEXT)")
    conn.commit()
    conn.close()

def validate_input(email, full_name, password):
    if not validate(email):
        return False, 'Invalid email address.'
    if not full_name or not password:
        return False, 'Full name and password cannot be empty.'
    return True, ''

def admin_status():
    # Check current admins
    conn = sqlite3.connect(DATABASE_URL.split('://')[1])
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM admins')
    admins = cursor.fetchall()
    conn.close()
    if admins:
        print('Existing admins:')
        for admin in admins:
            print(f'- {admin[0]} ({admin[1]})')
    else:
        print('No admins exist.')

def admin_create(email, full_name, password):
    valid, message = validate_input(email, full_name, password)
    if not valid:
        print(message)
        sys.exit(2)

    conn = sqlite3.connect(DATABASE_URL.split('://')[1])
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM admins WHERE email = ?', (email,))
    if cursor.fetchone():
        print('Admin already exists. Cannot create another.')
        sys.exit(3)
    cursor.execute('INSERT INTO admins (email, full_name, password) VALUES (?, ?, ?)', (email, full_name, password))
    conn.commit()
    conn.close()
    print('Admin created successfully.')

def admin_delete():
    conn = sqlite3.connect(DATABASE_URL.split('://')[1])
    cursor = conn.cursor()
    cursor.execute('DELETE FROM admins')
    conn.commit()
    conn.close()
    print('All admin roles removed.')

def admin_reset(email, full_name):
    conn = sqlite3.connect(DATABASE_URL.split('://')[1])
    cursor = conn.cursor()
    cursor.execute('DELETE FROM admins')
    valid, message = validate_input(email, full_name, getpass('New password: '))
    if not valid:
        print(message)
        sys.exit(2)
    cursor.execute('INSERT INTO admins (email, full_name, password) VALUES (?, ?, ?)', (email, full_name, getpass()))
    conn.commit()
    conn.close()
    print('Admin roles reset and created successfully.')

def admin_promote(email):
    conn = sqlite3.connect(DATABASE_URL.split('://')[1])
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM admins WHERE email = ?', (email,))
    if not cursor.fetchone():
        print('No such email among admins.')
        sys.exit(3)
    print('Admin role assigned successfully.')
    conn.close()

if __name__ == '__main__':
    init_db()
    if len(sys.argv) < 3:
        print('Usage: python3 -m backend.cli admin status|create|delete|reset|promote')
        sys.exit(2)

    command = sys.argv[2]
    if command == 'status':
        admin_status()
    elif command == 'create':
        if len(sys.argv) != 6:
            print('Usage: create email full_name password')
            sys.exit(2)
        admin_create(sys.argv[3], sys.argv[4], sys.argv[5])
    elif command == 'delete':
        admin_delete()
    elif command == 'reset':
        if len(sys.argv) != 5:
            print('Usage: reset email full_name')
            sys.exit(2)
        admin_reset(sys.argv[3], sys.argv[4])
    elif command == 'promote':
        if len(sys.argv) != 4:
            print('Usage: promote email')
            sys.exit(2)
        admin_promote(sys.argv[3])
    else:
        print('Invalid command.')
        sys.exit(2)