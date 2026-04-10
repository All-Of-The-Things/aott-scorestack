export const suggestMock = {
  "criteria": [
    {
      "field": "current_title",
      "match_type": "list",
      "match_values": [
        "Implementation Manager",
        "Director of NetSuite Implementation",
        "NetSuite Implementation Consultant",
        "NetSuite Consultant",
        "ERP Implementation Manager",
        "NetSuite Administrator",
        "NetSuite Functional Consultant",
        "Implementation Consultant"
      ],
      "score_if_match": 100,
      "score_if_no_match": 10,
      "weight": 35
    },
    {
      "field": "seniority",
      "match_type": "list",
      "match_values": ["director", "manager", "senior", "vp", "head"],
      "score_if_match": 100,
      "score_if_no_match": 30,
      "weight": 25
    },
    {
      "field": "industry",
      "match_type": "list",
      "match_values": [
        "Information Technology and Services",
        "Computer Software",
        "Management Consulting",
        "Accounting",
        "Financial Services",
        "Professional Services"
      ],
      "score_if_match": 100,
      "score_if_no_match": 40,
      "weight": 20
    },
    {
      "field": "company_size",
      "match_type": "range",
      "match_values": ["50", "1000"],
      "score_if_match": 100,
      "score_if_no_match": 40,
      "weight": 10
    },
    {
      "field": "location",
      "match_type": "list",
      "match_values": [
        "New York, New York, United States",
        "Los Angeles, California, United States",
        "Chicago, Illinois, United States",
        "San Francisco, California, United States",
        "Boston, Massachusetts, United States",
        "Atlanta, Georgia, United States",
        "Dallas, Texas, United States",
        "Seattle, Washington, United States"
      ],
      "score_if_match": 100,
      "score_if_no_match": 60,
      "weight": 10
    }
  ]
}
