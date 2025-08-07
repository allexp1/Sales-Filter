import pandas as pd

# Create test data
data = {
    'name': [
        'John Smith',
        'Jane Doe', 
        'Mike Johnson',
        'Sarah Williams',
        'Bob Brown',
        'Alice Davis',
        'Tom Wilson',
        'Emma Garcia'
    ],
    'email': [
        'john.smith@techcorp.com',
        'jane@gmail.com',
        'mike@globaltel.net',
        'sarah@netservices.org',
        'bob@yahoo.com',
        'alice@enterprise.com',
        'tom@startup.io',
        'emma@icloud.com'
    ],
    'date': [
        '2025-01-15',
        '2025-01-16',
        '2025-01-17',
        '2025-01-18',
        '2025-01-19',
        '2025-01-20',
        '2025-01-21',
        '2025-01-22'
    ]
}

# Create DataFrame
df = pd.DataFrame(data)

# Save to Excel
df.to_excel('test_v06_data.xlsx', index=False)
print("Created test_v06_data.xlsx with proper Excel format")