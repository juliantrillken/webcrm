
import {render} from 'preact';
import {useState, useEffect, useCallback} from 'preact/hooks';
import {html} from 'htm/preact';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';

// --- DATA TYPES ---
interface Note {
  id: string;
  date: string;
  content: string;
  isFuture?: boolean;
}

interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  address: string;
  email: string;
  phone: string;
  source: string;
  lastContact: string;
  firstContact: string;
  industry: string;
  nextSteps: string;
  reminderDate: string | null;
  notes: Note[];
  sjSeen: boolean;
  info: string;
  inactive: boolean;
}

interface CompanySettings {
  companyName: string;
  logo: string | null;
}

type View = 'dashboard' | 'customerList' | 'customerForm' | 'settings' | 'emailAssignment' | 'doings';

// --- HELPER FUNCTIONS ---
const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T | ((prevState: T) => T)) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((prevState: T) => T)) => {
    try {
      if (value instanceof Function) {
        setStoredValue(prevState => {
          const newState = value(prevState);
          window.localStorage.setItem(key, JSON.stringify(newState));
          return newState;
        });
      } else {
        setStoredValue(value);
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
};

const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleDateString();
    } catch {
        return 'Invalid Date';
    }
}

// --- UI COMPONENTS ---

const Header = ({ settings, setView }: { settings: CompanySettings, setView: (view: View) => void }) => {
  return html`
    <header>
      <div class="logo-container">
        ${settings.logo && html`<img src=${settings.logo} alt="Company Logo" />`}
        <h1>${settings.companyName || 'CRM Pro'}</h1>
      </div>
      <nav>
        <button onClick=${() => setView('dashboard')}>Dashboard</button>
        <button onClick=${() => setView('settings')}>Einstellungen</button>
      </nav>
    </header>
  `;
};

const Dashboard = ({ setView, setEditingCustomerId, customers }: { setView: (view: View) => void; setEditingCustomerId: (id: string | null) => void; customers: Customer[] }) => {
    const upcomingDoings = customers
        .filter(c => c.reminderDate && !c.inactive)
        .sort((a, b) => new Date(a.reminderDate!).getTime() - new Date(b.reminderDate!).getTime())
        .slice(0, 5);

  return html`
    <div class="dashboard-grid">
        <div class="card">
          <h2>Willkommen zurück!</h2>
          <p>Verwalten Sie Ihre Kundenbeziehungen effizient und einfach.</p>
          <div class="dashboard-actions" style=${{ marginTop: '1.5rem' }}>
            <button class="btn btn-primary" onClick=${() => { setEditingCustomerId(null); setView('customerForm'); }}>
              Neuen Kunden anlegen
            </button>
            <button class="btn btn-secondary" onClick=${() => setView('customerList')}>
              Kundenliste anzeigen
            </button>
             <button class="btn btn-secondary" onClick=${() => setView('doings')}>
              Offene Doings
            </button>
             <button class="btn btn-secondary" onClick=${() => setView('emailAssignment')}>
              E-Mail zuweisen
            </button>
          </div>
        </div>
        <div class="card">
            <h2>Nächste 5 offene Doings</h2>
            ${upcomingDoings.length > 0 ? html`
                <ul class="upcoming-doings-list">
                    ${upcomingDoings.map(customer => {
                        const isOverdue = new Date(customer.reminderDate!) < new Date();
                        return html`
                            <li class="upcoming-doings-item" onClick=${() => { setEditingCustomerId(customer.id); setView('customerForm'); }}>
                                <div class="upcoming-doings-item-info">
                                    <strong>${customer.companyName}</strong>
                                    <small>${customer.nextSteps}</small>
                                </div>
                                <span class="upcoming-doings-item-date ${isOverdue ? 'overdue' : ''}">${formatDate(customer.reminderDate)}</span>
                            </li>
                        `;
                    })}
                </ul>
            ` : html`
                <p>Keine bevorstehenden Aufgaben. Gut gemacht!</p>
            `}
        </div>
    </div>
  `;
};

const Doings = ({ customers, saveCustomer, setView, setEditingCustomerId }: { customers: Customer[], saveCustomer: (customer: Customer) => void, setView: (view: View) => void, setEditingCustomerId: (id: string) => void }) => {
    const openTasks = customers
        .filter(c => c.reminderDate && !c.inactive)
        .sort((a, b) => new Date(a.reminderDate!).getTime() - new Date(b.reminderDate!).getTime());

    const handleComplete = (customer: Customer) => {
        const updatedCustomer: Customer = {
            ...customer,
            reminderDate: null,
            notes: [
                ...(customer.notes || []),
                {
                    id: crypto.randomUUID(),
                    date: new Date().toISOString(),
                    content: `Aufgabe erledigt: ${customer.nextSteps}`
                }
            ],
            lastContact: new Date().toISOString().split('T')[0]
        };
        saveCustomer(updatedCustomer);
    };

    const handleReschedule = (customer: Customer, days: number) => {
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + days);
        const updatedCustomer: Customer = {
            ...customer,
            reminderDate: newDate.toISOString().split('T')[0]
        };
        saveCustomer(updatedCustomer);
    };
    
    if (openTasks.length === 0) {
        return html`
            <div class="empty-state card">
                <h3>Keine offenen Aufgaben</h3>
                <p>Sie haben alle Ihre Aufgaben erledigt. Gut gemacht!</p>
                <button class="btn btn-secondary" onClick=${() => setView('dashboard')}>
                  Zurück zum Dashboard
                </button>
            </div>
        `;
    }

    return html`
        <div class="card">
            <h2>Offene Doings (${openTasks.length})</h2>
            <div class="doings-list">
                ${openTasks.map(customer => {
                    const isOverdue = new Date(customer.reminderDate!) < new Date();
                    return html`
                        <div class="doing-item card ${isOverdue ? 'overdue-doing' : ''}">
                            <div class="doing-item-header">
                                <h3><a href="#" onClick=${(e: MouseEvent) => { e.preventDefault(); setEditingCustomerId(customer.id); setView('customerForm'); }}>${customer.companyName}</a></h3>
                                <span class="doing-date ${isOverdue ? 'overdue' : ''}">Fällig: ${formatDate(customer.reminderDate)}</span>
                            </div>
                            <p>${customer.nextSteps}</p>
                            <div class="doing-actions">
                                <span>Neu terminieren:</span>
                                <button class="btn btn-secondary btn-sm" onClick=${() => handleReschedule(customer, 7)}>1 Woche</button>
                                <button class="btn btn-secondary btn-sm" onClick=${() => handleReschedule(customer, 14)}>2 Wochen</button>
                                <div class="doing-actions-right">
                                    <button class="btn btn-success" onClick=${() => handleComplete(customer)}>Erledigt</button>
                                </div>
                            </div>
                        </div>
                    `;
                })}
            </div>
        </div>
    `;
};

const CustomerList = ({ customers, setView, setEditingCustomerId, deleteCustomer }: { customers: Customer[], setView: (view: View) => void; setEditingCustomerId: (id: string | null) => void; deleteCustomer: (id: string) => void; }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSource, setFilterSource] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('');
    const [filterReminder, setFilterReminder] = useState(false);
    const [sortBy, setSortBy] = useState('lastContact');
    const [showInactive, setShowInactive] = useState(false);
    
    const filteredCustomers = customers.filter(customer => {
      if (showInactive) {
          if (!customer.inactive) return false;
      } else {
          if (customer.inactive) return false;
      }
      
      if (searchTerm) {
          const lowerSearchTerm = searchTerm.toLowerCase();
          const searchIn = [
              customer.companyName,
              customer.contactPerson,
              customer.email,
              customer.industry
          ].join(' ').toLowerCase();
          if (!searchIn.includes(lowerSearchTerm)) return false;
      }

      if (filterSource && customer.source !== filterSource) return false;
      if (filterIndustry && !customer.industry.toLowerCase().includes(filterIndustry.toLowerCase())) return false;
      if (filterReminder && !customer.reminderDate) return false;
      return true;
    });

    const sortedCustomers = [...filteredCustomers].sort((a, b) => {
        switch(sortBy) {
            case 'companyName':
                return a.companyName.localeCompare(b.companyName);
            case 'firstContact':
                return new Date(b.firstContact).getTime() - new Date(a.firstContact).getTime();
            case 'lastContact':
            default:
                return new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime();
        }
    });

    if (customers.length === 0) {
        return html`
            <div class="empty-state card">
                <h3>Keine Kunden gefunden</h3>
                <p>Legen Sie Ihren ersten Kunden an, um loszulegen.</p>
                <button class="btn btn-primary" onClick=${() => { setEditingCustomerId(null); setView('customerForm'); }}>
                  Neuen Kunden anlegen
                </button>
            </div>
        `;
    }

  return html`
    <div class="card">
      <div class="customer-list-header">
        <h2>${showInactive ? 'Inaktive Kunden' : 'Aktive Kunden'}</h2>
        <div>
            <button class="btn btn-secondary" onClick=${() => setShowInactive(!showInactive)}>
                ${showInactive ? 'Aktive Kunden anzeigen' : 'Inaktive Kunden anzeigen'}
            </button>
            <button class="btn btn-primary" onClick=${() => { setEditingCustomerId(null); setView('customerForm'); }}>
                Neuen Kunden anlegen
            </button>
        </div>
      </div>

       <div class="filter-container">
        <div class="form-group search-group">
          <label for="searchTerm">Suche</label>
          <input type="text" id="searchTerm" placeholder="Firma, Person, E-Mail..." value=${searchTerm} onInput=${e => setSearchTerm(e.target.value)} />
        </div>
        <div class="form-group">
          <label for="filterSource">Quelle</label>
          <select id="filterSource" value=${filterSource} onChange=${e => setFilterSource(e.target.value)}>
            <option value="">Alle</option>
            <option value="Google">Google</option>
            <option value="Empfehlung">Empfehlung</option>
            <option value="Messe">Messe</option>
            <option value="Sonstiges">Sonstiges</option>
          </select>
        </div>
        <div class="form-group">
          <label for="filterIndustry">Branche</label>
          <input type="text" id="filterIndustry" placeholder="Branche suchen..." value=${filterIndustry} onInput=${e => setFilterIndustry(e.target.value)} />
        </div>
        <div class="form-group">
            <label>Filter</label>
            <div class="checkbox-group">
                <input type="checkbox" id="filterReminder" checked=${filterReminder} onChange=${e => setFilterReminder(e.target.checked)} />
                <label for="filterReminder">Nur mit Reminder</label>
            </div>
        </div>
        <div class="form-group">
            <label for="sortBy">Sortieren nach</label>
            <select id="sortBy" value=${sortBy} onChange=${e => setSortBy(e.target.value)}>
                <option value="lastContact">Letzter Kontakt</option>
                <option value="companyName">Firma</option>
                <option value="firstContact">Erstkontakt</option>
            </select>
        </div>
      </div>

      <div style=${{ overflowX: 'auto' }}>
        <table class="customer-table">
          <thead>
            <tr>
              <th>Firma</th>
              <th>Ansprechpartner</th>
              <th>Letzter Kontakt</th>
              <th>Nächste Schritte / Reminder</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            ${sortedCustomers.map(customer => {
              const isOverdue = customer.reminderDate && new Date(customer.reminderDate) < new Date();
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              const isOldContact = new Date(customer.lastContact) < threeMonthsAgo;

              return html`
                <tr key=${customer.id} class=${isOldContact ? 'old-contact' : ''}>
                  <td>
                    <strong>${customer.companyName}</strong><br/>
                    <small>${customer.industry}</small>
                  </td>
                  <td>
                    ${customer.contactPerson} 
                    ${customer.email && !showInactive && html`<a href="mailto:${customer.email}" class="email-icon" title=${`E-Mail an ${customer.contactPerson}`}>📧</a>`}
                    <br/><small>${customer.email}</small>
                  </td>
                  <td>${formatDate(customer.lastContact)}</td>
                  <td>
                    ${customer.nextSteps}
                    ${customer.reminderDate && html`
                        <div class="reminder ${isOverdue ? 'overdue' : ''}">
                           <span>&#128337;</span> ${formatDate(customer.reminderDate)}
                        </div>
                    `}
                  </td>
                  <td>
                    <div class="actions">
                        <button class="btn btn-secondary" onClick=${() => { setEditingCustomerId(customer.id); setView('customerForm'); }}>Bearbeiten</button>
                        <button class="btn btn-danger" onClick=${() => {
                            if (window.confirm('Sind Sie sicher, dass Sie diesen Kunden endgültig löschen möchten?')) {
                                deleteCustomer(customer.id);
                            }
                        }}>Löschen</button>
                    </div>
                  </td>
                </tr>
              `
            })}
          </tbody>
        </table>
         ${sortedCustomers.length === 0 && html`<p style=${{textAlign: 'center', padding: '2rem'}}>Keine Kunden entsprechen Ihren Filterkriterien.</p>`}
      </div>
    </div>
  `;
};


const CustomerForm = ({ saveCustomer, setView, editingCustomerId, customers, deleteCustomer }: { saveCustomer: (customer: Customer) => void, setView: (view: View) => void; editingCustomerId: string | null, customers: Customer[], deleteCustomer: (id: string) => void }) => {
  const customer = customers.find(c => c.id === editingCustomerId);
  
  const [activeTab, setActiveTab] = useState('info');
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState('');


  const [formData, setFormData] = useState<Omit<Customer, 'id' | 'notes'>>({
    companyName: customer?.companyName || '',
    contactPerson: customer?.contactPerson || '',
    address: customer?.address || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    source: customer?.source || 'Google',
    lastContact: customer?.lastContact || new Date().toISOString().split('T')[0],
    firstContact: customer?.firstContact || new Date().toISOString().split('T')[0],
    industry: customer?.industry || '',
    nextSteps: customer?.nextSteps || '',
    reminderDate: customer?.reminderDate || null,
    sjSeen: customer?.sjSeen || false,
    info: customer?.info || '',
    inactive: customer?.inactive || false,
  });

  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const name = target.name;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleReminderChange = (days: number | null) => {
    if (days === null) {
      setFormData(prev => ({ ...prev, reminderDate: null }));
      return;
    }
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFormData(prev => ({ ...prev, reminderDate: date.toISOString().split('T')[0] }));
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!formData.companyName) {
        alert('Firmenname ist ein Pflichtfeld.');
        return;
    }
    const id = editingCustomerId || crypto.randomUUID();
    const existingNotes = customers.find(c => c.id === id)?.notes || [];
    saveCustomer({ id, ...formData, notes: existingNotes });
    setView('customerList');
  };
  
  const handleDelete = () => {
    if (editingCustomerId && window.confirm('Sind Sie sicher, dass Sie diesen Kunden endgültig löschen möchten?')) {
        deleteCustomer(editingCustomerId);
        setView('customerList');
    }
  };
  
  const handleAddNote = () => {
    if (!newNote.trim() || !customer) return;
    const updatedCustomer: Customer = {
        ...customer,
        lastContact: new Date().toISOString().split('T')[0],
        notes: [
            ...(customer.notes || []),
            {
                id: crypto.randomUUID(),
                date: new Date().toISOString(),
                content: newNote
            }
        ]
    };
    saveCustomer(updatedCustomer);
    setNewNote('');
  };

  const handleEditNoteDate = (note: Note) => {
    setEditingNoteId(note.id);
    const localDate = new Date(note.date);
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    setEditingDate(localDate.toISOString().slice(0, 16));
  };

  const handleSaveNoteDate = (noteId: string) => {
    if (!customer || !editingDate) return;
    const updatedNotes = customer.notes.map(note => 
      note.id === noteId ? { ...note, date: new Date(editingDate).toISOString() } : note
    );
    const updatedCustomer = { ...customer, notes: updatedNotes };
    saveCustomer(updatedCustomer);
    setEditingNoteId(null);
    setEditingDate('');
  };
  
  const getCombinedHistory = () => {
      if (!customer) return [];
      const historyItems: Note[] = [...(customer.notes || [])];
      
      if (customer.nextSteps && customer.reminderDate) {
          historyItems.push({
              id: 'reminder',
              date: customer.reminderDate,
              content: `Nächste Aufgabe: ${customer.nextSteps}`,
              isFuture: true,
          });
      }
      
      return historyItems.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  return html`
    <div class="card">
        <h2>${editingCustomerId ? `Kunde: ${customer?.companyName}` : 'Neuen Kunden anlegen'}</h2>
        
        ${editingCustomerId && html`
            <div class="tabs">
                <button class="tab-link ${activeTab === 'info' ? 'active' : ''}" onClick=${() => setActiveTab('info')}>Kundeninformationen</button>
                <button class="tab-link ${activeTab === 'history' ? 'active' : ''}" onClick=${() => setActiveTab('history')}>Historie</button>
            </div>
        `}

        <div style=${{display: !editingCustomerId || activeTab === 'info' ? 'block' : 'none'}}>
            <form onSubmit=${handleSubmit} class="tab-content">
                <div style=${{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                    <div class="form-group">
                        <label for="companyName">Firmenname *</label>
                        <input type="text" id="companyName" name="companyName" value=${formData.companyName} onInput=${handleChange} required />
                    </div>
                    <div class="form-group">
                        <label for="contactPerson">Ansprechpartner</label>
                        <input type="text" id="contactPerson" name="contactPerson" value=${formData.contactPerson} onInput=${handleChange} />
                    </div>
                     <div class="form-group">
                        <label for="email">E-Mail</label>
                        <input type="email" id="email" name="email" value=${formData.email} onInput=${handleChange} />
                    </div>
                    <div class="form-group">
                        <label for="phone">Telefonnummer</label>
                        <input type="tel" id="phone" name="phone" value=${formData.phone} onInput=${handleChange} />
                    </div>
                </div>
                 <div class="form-group">
                    <label for="address">Adresse</label>
                    <textarea id="address" name="address" onInput=${handleChange}>${formData.address}</textarea>
                </div>
                <div style=${{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem'}}>
                    <div class="form-group">
                        <label for="source">Woher kommt der Kunde?</label>
                        <select id="source" name="source" value=${formData.source} onChange=${handleChange}>
                            <option value="Google">Google</option>
                            <option value="Empfehlung">Empfehlung</option>
                            <option value="Messe">Messe</option>
                            <option value="Sonstiges">Sonstiges</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="firstContact">Erstkontakt</label>
                        <input type="date" id="firstContact" name="firstContact" value=${formData.firstContact} onInput=${handleChange} />
                    </div>
                    <div class="form-group">
                        <label for="lastContact">Letzter Kontakt</label>
                        <input type="date" id="lastContact" name="lastContact" value=${formData.lastContact} onInput=${handleChange} />
                    </div>
                </div>
                <div class="form-group">
                    <label for="industry">Branche des Kunden</label>
                    <input type="text" id="industry" name="industry" value=${formData.industry} onInput=${handleChange} />
                </div>
                 <div class="form-group">
                    <label for="info">Infos</label>
                    <textarea id="info" name="info" onInput=${handleChange}>${formData.info}</textarea>
                </div>
                <div class="form-group">
                    <label for="nextSteps">Was soll als nächstes gemacht werden / worauf warten wir?</label>
                    <textarea id="nextSteps" name="nextSteps" onInput=${handleChange}>${formData.nextSteps}</textarea>
                </div>
                 <div class="form-group">
                    <div class="checkbox-group" style=${{ height: 'auto', gap: '2rem' }}>
                        <div class="checkbox-item">
                            <input type="checkbox" id="sjSeen" name="sjSeen" checked=${formData.sjSeen} onChange=${handleChange} />
                            <label for="sjSeen">SJ gesehen</label>
                        </div>
                         <div class="checkbox-item">
                            <input type="checkbox" id="inactive" name="inactive" checked=${formData.inactive} onChange=${handleChange} />
                            <label for="inactive">Kunde inaktiv</label>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Reminder für eine Aufgabe</label>
                    <div style=${{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" class="btn btn-secondary" onClick=${() => handleReminderChange(7)}>1 Woche</button>
                        <button type="button" class="btn btn-secondary" onClick=${() => handleReminderChange(14)}>2 Wochen</button>
                        <button type="button" class="btn btn-secondary" onClick=${() => handleReminderChange(28)}>4 Wochen</button>
                        <input type="date" name="reminderDate" value=${formData.reminderDate || ''} onInput=${handleChange} />
                        ${formData.reminderDate && html`<button type="button" class="btn btn-danger" onClick=${() => handleReminderChange(null)}>Löschen</button>`}
                    </div>
                </div>
                <div class="form-actions">
                     ${editingCustomerId && html`
                        <button type="button" class="btn btn-danger" onClick=${handleDelete} style=${{ marginRight: 'auto' }}>Kunde löschen</button>
                    `}
                    <button type="submit" class="btn btn-primary">Speichern</button>
                    ${editingCustomerId && formData.email && html`<a href="mailto:${formData.email}" class="btn btn-secondary">Neue E-Mail</a>`}
                    <button type="button" class="btn btn-secondary" onClick=${() => setView('customerList')}>Abbrechen</button>
                </div>
            </form>
        </div>

        <div style=${{display: editingCustomerId && activeTab === 'history' ? 'block' : 'none'}}>
            <div class="tab-content">
                <h3>Historie</h3>
                <div class="history-list">
                    ${getCombinedHistory().length > 0 ? getCombinedHistory().map(note => html`
                        <div class="history-item ${note.isFuture ? 'future-item' : ''}">
                            ${editingNoteId === note.id ? html`
                                <div class="history-item-edit">
                                    <input type="datetime-local" value=${editingDate} onInput=${e => setEditingDate(e.target.value)} />
                                    <button class="btn btn-success btn-sm" onClick=${() => handleSaveNoteDate(note.id)}>Speichern</button>
                                    <button class="btn btn-secondary btn-sm" onClick=${() => setEditingNoteId(null)}>Abbrechen</button>
                                </div>
                            ` : html`
                                <strong>
                                    ${new Date(note.date).toLocaleString()}
                                    ${!note.isFuture && html`<button class="btn-edit-date" onClick=${() => handleEditNoteDate(note)}>📅</button>`}
                                </strong>
                            `}
                            <p>${note.content}</p>
                        </div>
                    `) : html`<p>Keine Einträge in der Historie vorhanden.</p>`}
                </div>
                <div class="add-note-form">
                    <h4>Neuen Eintrag hinzufügen</h4>
                    <div class="form-group">
                        <textarea 
                            rows="4" 
                            placeholder="Was wurde besprochen? Welche Aktion wurde durchgeführt?"
                            value=${newNote}
                            onInput=${e => setNewNote(e.target.value)}
                        ></textarea>
                    </div>
                    <button class="btn btn-primary" onClick=${handleAddNote} disabled=${!newNote.trim()}>Eintrag speichern</button>
                </div>
                 <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onClick=${() => setView('customerList')}>Zurück zur Liste</button>
                 </div>
            </div>
        </div>
    </div>
  `;
};

const EmailAssignment = ({ customers, saveCustomer, setView, ai }) => {
    const [emailText, setEmailText] = useState('');
    const [assignmentState, setAssignmentState] = useState({ loading: false, error: null, success: null });
    const [previewData, setPreviewData] = useState(null);

    const handleAssignEmail = async () => {
        if (!emailText.trim()) {
            alert('Bitte fügen Sie den E-Mail-Text ein.');
            return;
        }
        setAssignmentState({ loading: true, error: null, success: null });
        setPreviewData(null);
        try {
            const customerDataForPrompt = customers.filter(c => !c.inactive).map(c => ({
                id: c.id,
                companyName: c.companyName,
                contactPerson: c.contactPerson,
                email: c.email
            }));
            
             const schema = {
                type: Type.OBJECT,
                properties: {
                    customerId: { type: Type.STRING, description: "The unique ID of the matched customer from the list." },
                    contactPerson: { type: Type.STRING, description: "The full name of the contact person found in the email." },
                    email: { type: Type.STRING, description: "The email address found in the email signature or body." },
                    phone: { type: Type.STRING, description: "The phone number found in the email." },
                    address: { type: Type.STRING, description: "The physical address found in the email." },
                    summary: { type: Type.STRING, description: "A one or two-sentence summary of the email's content." }
                },
                 required: ['customerId', 'contactPerson', 'email', 'phone', 'address', 'summary']
            };

            const prompt = `You are a CRM assistant. Your task is to analyze an email content and a list of customers to perform two actions:
1. Identify which customer the email belongs to.
2. Extract contact information (contact person, email, phone, address) and create a concise summary of the email's content.

Here is the list of customers: ${JSON.stringify(customerDataForPrompt)}
Here is the email content: "${emailText}"

Analyze the email content and signature carefully. Extract any updated or new contact information. The summary should be a brief, one or two-sentence description of the email's purpose.

Respond ONLY with a JSON object that adheres to the provided schema.
- If a matching customer is found, provide their 'id' in 'customerId'.
- If any contact details are found, populate the corresponding fields. If a detail is not found, return an empty string "".
- If no customer can be confidently matched, 'customerId' should be null.`;

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: { responseMimeType: "application/json", responseSchema: schema }
            });
            
            const result = JSON.parse(response.text);
            
            if (result.customerId) {
                const matchedCustomer = customers.find(c => c.id === result.customerId);
                if (matchedCustomer) {
                    setPreviewData({
                        matchedCustomer,
                        extractedData: {
                            contactPerson: result.contactPerson || '',
                            email: result.email || '',
                            phone: result.phone || '',
                            address: result.address || ''
                        },
                        summary: result.summary || 'E-Mail als Notiz hinzugefügt.'
                    });
                } else {
                     throw new Error(`Customer with ID ${result.customerId} not found.`);
                }
            } else {
                setAssignmentState({ loading: false, error: "Es konnte kein passender Kunde für diese E-Mail gefunden werden.", success: null });
            }

        } catch (error) {
            console.error("Error assigning email:", error);
            setAssignmentState({ loading: false, error: "Ein Fehler ist aufgetreten. Bitte prüfen Sie die Konsolenausgabe.", success: null });
        } finally {
            setAssignmentState(prev => ({ ...prev, loading: false }));
        }
    };
    
    const resetState = () => {
        setEmailText('');
        setPreviewData(null);
    };

    const handleUpdateAndAddNote = () => {
        if (!previewData) return;
        const { matchedCustomer, extractedData, summary } = previewData;
        const updatedCustomer = {
            ...matchedCustomer,
            contactPerson: extractedData.contactPerson || matchedCustomer.contactPerson,
            email: extractedData.email || matchedCustomer.email,
            phone: extractedData.phone || matchedCustomer.phone,
            address: extractedData.address || matchedCustomer.address,
            lastContact: new Date().toISOString().split('T')[0],
            notes: [
                ...(matchedCustomer.notes || []),
                { id: crypto.randomUUID(), date: new Date().toISOString(), content: summary }
            ]
        };
        saveCustomer(updatedCustomer);
        setAssignmentState({ loading: false, success: `Daten für "${matchedCustomer.companyName}" aktualisiert und Notiz hinzugefügt.`, error: null });
        resetState();
    };
    
    const handleJustAddNote = () => {
        if (!previewData) return;
        const { matchedCustomer, summary } = previewData;
        const updatedCustomer = {
            ...matchedCustomer,
            lastContact: new Date().toISOString().split('T')[0],
            notes: [
                ...(matchedCustomer.notes || []),
                { id: crypto.randomUUID(), date: new Date().toISOString(), content: summary }
            ]
        };
        saveCustomer(updatedCustomer);
        setAssignmentState({ loading: false, success: `Notiz zu "${matchedCustomer.companyName}" hinzugefügt.`, error: null });
        resetState();
    };


    if (previewData) {
        const { matchedCustomer, extractedData } = previewData;
        const changes = [
            { label: 'Ansprechpartner', oldVal: matchedCustomer.contactPerson, newVal: extractedData.contactPerson },
            { label: 'E-Mail', oldVal: matchedCustomer.email, newVal: extractedData.email },
            { label: 'Telefon', oldVal: matchedCustomer.phone, newVal: extractedData.phone },
            { label: 'Adresse', oldVal: matchedCustomer.address, newVal: extractedData.address },
        ].filter(item => item.newVal && item.newVal !== item.oldVal);
        
        return html`
         <div class="card email-assignment-card">
            <h2>Bestätigung der E-Mail-Zuweisung</h2>
            <p>Die KI hat die E-Mail <strong>${matchedCustomer.companyName}</strong> zugeordnet und folgende Informationen gefunden. Bitte überprüfen und bestätigen.</p>
            
            <div class="update-preview">
                <h3>Gefundene Informationen:</h3>
                ${changes.length > 0 ? changes.map(item => html`
                    <div class="preview-item">
                        <span class="preview-label">${item.label}</span>
                        <div class="preview-values">
                            <span class="old-data">${item.oldVal || 'Kein alter Wert'}</span>
                            <span>&rarr;</span>
                            <span class="new-data">${item.newVal}</span>
                        </div>
                    </div>
                `) : html`<p>Keine neuen oder geänderten Kontaktinformationen gefunden.</p>`}
                <div class="preview-item">
                     <span class="preview-label">Zusammenfassung</span>
                     <div class="preview-values">
                        <p><em>"${previewData.summary}"</em></p>
                    </div>
                </div>
            </div>

            <div class="form-actions">
                <button class="btn btn-primary" onClick=${handleUpdateAndAddNote}>Aktualisieren & Hinzufügen</button>
                <button class="btn btn-secondary" onClick=${handleJustAddNote}>Nur Notiz hinzufügen</button>
                <button type="button" class="btn btn-secondary" onClick=${() => setPreviewData(null)}>Abbrechen</button>
            </div>
        </div>
        `;
    }

    return html`
        <div class="card email-assignment-card">
            <h2>E-Mail zuweisen</h2>
            <p>Fügen Sie hier den Inhalt einer E-Mail ein. Die KI versucht, den passenden Kunden zu finden, Kontaktdaten zu extrahieren und die E-Mail als Notiz zu hinterlegen.</p>
            <div class="form-group">
                <label for="emailContent">E-Mail Inhalt</label>
                <textarea 
                    id="emailContent" 
                    rows="10" 
                    value=${emailText} 
                    onInput=${(e) => setEmailText(e.target.value)}
                    placeholder="Kopieren Sie den gesamten E-Mail-Text hier hinein..."
                ></textarea>
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" onClick=${handleAssignEmail} disabled=${assignmentState.loading}>
                    ${assignmentState.loading ? html`<div class="spinner"></div> Analysieren...` : 'E-Mail analysieren'}
                </button>
                <button type="button" class="btn btn-secondary" onClick=${() => setView('dashboard')}>Zurück zum Dashboard</button>
            </div>
            ${assignmentState.success && html`<div class="alert alert-success">${assignmentState.success}</div>`}
            ${assignmentState.error && html`<div class="alert alert-danger">${assignmentState.error}</div>`}
        </div>
    `;
};


const Settings = ({ settings, setSettings, setView, setCustomers }: { settings: CompanySettings; setSettings: (s: CompanySettings) => void; setView: (v: View) => void; setCustomers: (fn: (prev: Customer[]) => Customer[]) => void; }) => {
    const handleNameChange = (e: Event) => {
        const { value } = e.target as HTMLInputElement;
        setSettings({ ...settings, companyName: value });
    };

    const handleLogoChange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSettings({ ...settings, logo: event.target?.result as string });
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleImport = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                let newCustomers: Customer[] = [];
                const fileName = file.name.toLowerCase();

                if (fileName.endsWith('.csv')) {
                    const csv = data as string;
                    const lines = csv.split('\n').slice(1);
                    lines.forEach(line => {
                        if (!line.trim()) return;
                        const fields = line.split(',').map(field => field.trim().replace(/"/g, ''));
                        const [companyName, contactPerson, address, email, phone, source, industry, nextSteps, firstContact, lastContact, sjSeen, info] = fields;
                        
                        if (companyName) {
                            newCustomers.push({
                                id: crypto.randomUUID(),
                                companyName,
                                contactPerson: contactPerson || '',
                                address: address || '',
                                email: email || '',
                                phone: phone || '',
                                source: source || 'Sonstiges',
                                industry: industry || '',
                                nextSteps: nextSteps || '',
                                firstContact: firstContact || new Date().toISOString().split('T')[0],
                                lastContact: lastContact || new Date().toISOString().split('T')[0],
                                sjSeen: sjSeen?.toLowerCase() === 'ja' || sjSeen?.toLowerCase() === 'yes',
                                info: info || '',
                                inactive: false,
                                reminderDate: null,
                                notes: [],
                            });
                        }
                    });
                } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

                    jsonData.forEach(row => {
                        const companyName = row.companyName || row.CompanyName;
                        if (companyName) {
                            newCustomers.push({
                                id: crypto.randomUUID(),
                                companyName: String(companyName),
                                contactPerson: String(row.contactPerson || row.ContactPerson || ''),
                                address: String(row.address || row.Address || ''),
                                email: String(row.email || row.Email || ''),
                                phone: String(row.phone || row.Phone || ''),
                                source: String(row.source || row.Source || 'Sonstiges'),
                                industry: String(row.industry || row.Industry || ''),
                                nextSteps: String(row.nextSteps || row.NextSteps || ''),
                                firstContact: row.firstContact || row.FirstContact ? new Date(row.firstContact || row.FirstContact).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                lastContact: row.lastContact || row.LastContact ? new Date(row.lastContact || row.LastContact).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                sjSeen: String(row.sjSeen || row.SjSeen || '').toLowerCase() === 'ja' || String(row.sjSeen || row.SjSeen || '').toLowerCase() === 'yes',
                                info: String(row.info || row.Info || ''),
                                inactive: false,
                                reminderDate: null,
                                notes: [],
                            });
                        }
                    });
                }

                if(newCustomers.length > 0) {
                     setCustomers(prev => [...prev, ...newCustomers]);
                     alert(`${newCustomers.length} Kunden erfolgreich importiert!`);
                } else {
                    alert('Keine gültigen Kunden zum Importieren gefunden. Bitte prüfen Sie das Dateiformat und den Inhalt.');
                }
            } catch (error) {
                console.error("Import Error:", error);
                alert(`Ein Fehler ist beim Importieren aufgetreten: ${error.message}`);
            }
        };

        if (file.name.toLowerCase().endsWith('.csv')) {
             reader.readAsText(file);
        } else {
             reader.readAsArrayBuffer(file);
        }
    };

    return html`
      <div class="card">
        <h2>Einstellungen</h2>
        <div class="form-group">
            <label for="companyName">Eigene Firma</label>
            <input type="text" id="companyName" value=${settings.companyName} onInput=${handleNameChange} />
        </div>
        <div class="form-group">
            <label for="logoUpload">Firmenlogo hochladen</label>
            <input type="file" id="logoUpload" accept="image/*" onChange=${handleLogoChange} />
            ${settings.logo && html`<img src=${settings.logo} alt="Logo preview" style=${{ height: '50px', marginTop: '1rem' }} />`}
        </div>
        <div class="import-section">
            <h3>Daten importieren</h3>
            <p>Importieren Sie eine CSV-, XLS- oder XLSX-Datei mit Ihren bestehenden Kundendaten. Die Spaltenüberschriften müssen sein:</p>
            <p><code>companyName, contactPerson, address, email, phone, source, industry, nextSteps, firstContact, lastContact, sjSeen, info</code></p>
            <p><small>Hinweis: 'sjSeen' sollte 'ja' oder 'nein' sein. Datumsfelder (firstContact, lastContact) sollten im Format YYYY-MM-DD sein oder als gültiges Excel-Datum.</small></p>
             <div class="form-group">
                <label for="fileImport">Datei auswählen</label>
                <input type="file" id="fileImport" accept=".csv, .xls, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange=${handleImport} />
            </div>
        </div>
        <div class="form-actions">
            <button class="btn btn-primary" onClick=${() => setView('dashboard')}>Fertig</button>
        </div>
      </div>
    `;
};

// --- MAIN APP ---

const App = () => {
  const [view, setView] = useState<View>('dashboard');
  const [customers, setCustomers] = useLocalStorage<Customer[]>('crm_customers', []);
  const [settings, setSettings] = useLocalStorage<CompanySettings>('crm_settings', { companyName: 'Meine Firma', logo: null });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


  const saveCustomer = useCallback((customer: Customer) => {
    setCustomers(prev => {
      const existing = prev.find(c => c.id === customer.id);
      if (existing) {
        return prev.map(c => c.id === customer.id ? customer : c);
      }
      return [...prev, customer];
    });
  }, [setCustomers]);

  const deleteCustomer = useCallback((id: string) => {
    setCustomers(prev => prev.filter(c => c.id !== id));
  }, [setCustomers]);

  const renderView = () => {
    switch(view) {
      case 'dashboard':
        return html`<${Dashboard} setView=${setView} setEditingCustomerId=${setEditingCustomerId} customers=${customers} />`;
      case 'customerList':
        return html`<${CustomerList} customers=${customers} setView=${setView} setEditingCustomerId=${setEditingCustomerId} deleteCustomer=${deleteCustomer} />`;
      case 'customerForm':
        return html`<${CustomerForm} saveCustomer=${saveCustomer} setView=${setView} editingCustomerId=${editingCustomerId} customers=${customers} deleteCustomer=${deleteCustomer} />`;
      case 'emailAssignment':
        return html`<${EmailAssignment} customers=${customers} saveCustomer=${saveCustomer} setView=${setView} ai=${ai} />`;
       case 'doings':
        return html`<${Doings} customers=${customers} saveCustomer=${saveCustomer} setView=${setView} setEditingCustomerId=${setEditingCustomerId} />`;
      case 'settings':
        return html`<${Settings} settings=${settings} setSettings=${setSettings} setView=${setView} setCustomers=${setCustomers} />`;
      default:
        return html`<${Dashboard} setView=${setView} setEditingCustomerId=${setEditingCustomerId} customers=${customers} />`;
    }
  }

  return html`
    <${Header} settings=${settings} setView=${setView} />
    <main>
      ${renderView()}
    </main>
  `;
};

render(html`<${App} />`, document.getElementById('app')!);
