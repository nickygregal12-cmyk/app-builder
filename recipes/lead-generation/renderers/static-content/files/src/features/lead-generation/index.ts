import EnquiryForm from './EnquiryForm.astro';

export const recipe = { id: 'lead-generation', label: 'Lead generation form' };

// The composer places an enquiry-form section wherever this capability is
// installed and the page is a contact surface; this recipe owns how it renders.
export const sections = { 'enquiry-form': EnquiryForm };
