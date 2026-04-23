# Plan: SAPUI5 Freestyle Treasury Dashboard

## TL;DR
Create a new SAPUI5 freestyle project using UI5 CLI with a Dynamic Page view containing a "Treasury" header and 3-4 empty icon tabs. Follow SAPUI5 best practices for component structure, naming conventions, and modular architecture.

**Tech Stack**: JavaScript, UI5 CLI, Module namespace: `cashpool.app`

## Steps

### Phase 1: Project Initialization
1. Initialize UI5 project using UI5 CLI with freestyle template
   - Creates standard project structure (webapp/, tests/, ui5.yaml, package.json)
   - Sets up component-based architecture
2. Configure manifest.json with app metadata (name, version, namespace: `cashpool.app`)
3. Install dependencies via npm

### Phase 2: View & Controller Setup
4. Create Treasury.view.xml with Dynamic Page control
   - Header with title "Treasury"
   - Content area placeholder for tabs
5. Create Treasury.controller.js (empty controller for extensibility)
6. Reference Treasury view in the main App.view.xml

### Phase 3: UI Component - IconTabFilter with Tabs
7. Add IconTabFilter to Treasury.view.xml content area
8. Create 4 empty tab items using IconTabFilter → items (sap.m:IconTabFilter) with:
   - Text labels: "Consulta de Saldos", "Transferencias Manuales", "Transferencias Automáticas", "Aprobaciones"
   - Icon keys will not be necessary at this point.
   - Empty content areas
   - Except for Tab 4, which will have a m.Table with no data (placeholder for future content)
9. Link controller methods for tab selection handling (onTabSelect or similar)

### Phase 4: Component & Routing Integration
10. Verify Component.js routes Treasury view as the default/home route
11. Ensure App.view.xml shell is properly configured with NavContainer or FrameworkRouter
12. Test navigation and component initialization

### Phase 5: Verification
13. Build project (`ui5 build`)
14. Launch dev server (`ui5 serve`) and verify in browser:
    - Dynamic Page loads with "Treasury" header
    - Tabs render with correct labels
    - Tab switching works without errors
    - Console has no critical errors

## Relevant Files
- `ui5.yaml` — Project configuration (created by CLI, minimal edits needed)
- `package.json` — Dependencies and scripts
- `webapp/manifest.json` — App metadata, routing, models
- `webapp/Component.js` — Component initialization, routing setup
- `webapp/view/App.view.xml` — Shell container
- `webapp/view/Treasury.view.xml` — Dynamic Page, IconTabFilter, tabs
- `webapp/controller/Treasury.controller.js` — Treasury tab logic

## Decisions
- **JavaScript over TypeScript**: Simpler setup, faster scaffolding
- **UI5 CLI**: Official tooling, best practices built-in
- **Modular structure**: Single Treasury view with component-based approach (scalable for future features)
- **IconTabFilter for tabs**: Standard SAPUI5 pattern for horizontal tabs with icons
- **Empty tab content**: Placeholder structure for future dashboard content

## Further Considerations
None at this stage—all requirements are clear and execution can proceed with standard SAPUI5 patterns.