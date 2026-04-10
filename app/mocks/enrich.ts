import { faker } from '@faker-js/faker';
import { LinkedInProfile } from '../lib/linkedapi';

export const enrichMock = (): LinkedInProfile => ({
  linkedin_url: faker.internet.url(),
  first_name: faker.person.firstName(),
  last_name: faker.person.lastName(),
  full_name: faker.person.fullName(),
  headline: faker.lorem.sentence(),
  current_title: faker.person.jobTitle(),
  seniority: faker.helpers.arrayElement(['Entry', 'Mid', 'Senior', 'Lead', 'Executive']),
  company_name: faker.company.name(),
  industry: faker.commerce.department(),
  company_size: faker.helpers.arrayElement(['1-10', '11-50', '51-200', '201-500', '500+']),
  location: faker.location.city() + ', ' + faker.location.country(),
});
