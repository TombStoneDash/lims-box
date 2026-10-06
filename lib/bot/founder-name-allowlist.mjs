// Publication exceptions, not a dictionary of names or ordinary English words.
// Add only explicitly approved public entities; full phrases avoid approving
// a third party merely because they share a company's founder's surname.
export const FOUNDER_NAME_ALLOWLIST = Object.freeze([
  'Hudson Taylor', 'Hudson', 'Hud', 'John Hudson Taylor', 'Hudson J. Taylor',
  'Taylor, Hudson', 'H. Taylor', 'TombStone Dash', 'LIMS BOX', 'LIMS Bot', 'SENAITE', 'LIMS',
  'DiaSorin LIAISON XL', 'DiaSorin', 'OrchidLive', 'Omega 11', 'Excel', 'CSV', 'TXT',
  'Berkshire Hathaway Energy', 'Berkshire Hathaway', 'MidAmerican Energy',
  'Clinisys', 'Horizon', 'Orchard Software', 'Orchard', 'LabWare', 'Thermo Fisher Scientific',
  'University of Iowa', 'University of Nebraska', 'Iowa State University',
  'FDA', 'EPA', 'CDC', 'CMS', 'CLIA', 'CAP', 'ISO', 'US', 'USA',
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming', 'District of Columbia', 'Des Moines', 'Omaha', 'Lincoln',
  'Iowa City', 'Sioux City', 'Sioux Falls', 'San Diego', 'San Francisco', 'Los Angeles',
  'Chicago', 'Denver', 'Seattle', 'Boston', 'New York City',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]);
